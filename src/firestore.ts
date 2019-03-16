import {
  FieldValue,
  Transaction,
  WhereFilterOp,
} from '@google-cloud/firestore';
import { getKeys } from './util';

export type BatchOp = (x: FirebaseFirestore.WriteBatch) => void;

export const firestoreServerNow = (): FieldValue =>
  FieldValue.serverTimestamp();

export const batchFirestoreOps = async (
  fs: FirebaseFirestore.Firestore,
  fns: BatchOp[]
): Promise<void> => {
  let i = 0;
  while (i < fns.length) {
    const batch = fs.batch();
    let j = 0;
    for (; j < 500 && i < fns.length; j += 1) {
      fns[i](batch);
      i += 1;
    }
    await batch.commit();
  }
};

const getFirstQueryDocumentSnapshot = (
  snapshot: FirebaseFirestore.QuerySnapshot
): FirebaseFirestore.QueryDocumentSnapshot | null =>
  snapshot.empty ? null : snapshot.docs[0];

type WithId<TData> = TData & { id: string };

export const getDataFromSnapshot = <TData>(
  snapshot: FirebaseFirestore.DocumentSnapshot
): WithId<TData> | null => {
  if (snapshot.exists) {
    const data = snapshot.data() as WithId<TData>;
    if (typeof data.id === 'undefined') {
      data.id = snapshot.id;
    }
    return data;
  }
  return null;
};

type ItemType<T> = T extends Array<infer I> ? I : never;

export type IFirestoreWhereConditions<TData> = Partial<
  {
    [key in keyof TData & string]: Partial<
      { [op in Exclude<WhereFilterOp, 'array-contains'> & string]: TData[key] }
    > &
      Partial<{ ['array-contains']: ItemType<TData[key]> }>
  }
>;

export const getAllByIdsTransaction = async <
  Map extends { [key: string]: [FirestoreCollection<any>, string] }
>(
  transaction: Transaction,
  map: Map
): Promise<
  {
    [key in keyof Map]: Map[key][0] extends FirestoreCollection<any, infer R>
      ? WithId<R> | null
      : never
  }
> => {
  const keys = Object.keys(map);
  if (!keys.length) {
    return {} as any;
  }

  const refs = keys.map((k) => {
    const [col, id] = map[k];
    return col.doc(id);
  }) as [FirebaseFirestore.DocumentReference]; // to let typescript know that there is at least one ref in array

  const snapshots = await transaction.getAll(...refs);

  const out: any = {};

  snapshots.forEach((snapshot, i) => {
    const key = keys[i];
    const [col] = map[key];
    out[key] = col.getDataFromSnapshot(snapshot);
  });

  return out;
};

export class FirestoreCollection<
  TCreate extends {},
  TRead = TCreate,
  TUpdate = TCreate
> {
  public colRef: FirebaseFirestore.CollectionReference;

  constructor(
    public fs: FirebaseFirestore.Firestore,
    public collectionName: string
  ) {
    this.colRef = fs.collection(collectionName);
  }

  public getDataFromSnapshot = (
    snapshot:
      | FirebaseFirestore.DocumentSnapshot
      | FirebaseFirestore.QueryDocumentSnapshot
      | null
  ): WithId<TRead> | null => snapshot && getDataFromSnapshot(snapshot);

  public getDataFromSnapshots = (
    snapshots: Array<
      | FirebaseFirestore.DocumentSnapshot
      | FirebaseFirestore.QueryDocumentSnapshot
      | null
    >
  ): Array<WithId<TRead> | null> => snapshots.map(this.getDataFromSnapshot);

  public doc = (id: string): FirebaseFirestore.DocumentReference =>
    this.colRef.doc(id);

  public ref = (id: string): FirebaseFirestore.DocumentReference =>
    this.colRef.doc(id);

  public docs = (ids: string[]): FirebaseFirestore.DocumentReference[] =>
    ids.map(this.doc);

  public refs = (ids: string[]): FirebaseFirestore.DocumentReference[] =>
    ids.map(this.ref);

  public newDoc = (): FirebaseFirestore.DocumentReference => this.colRef.doc();

  public getByRef = (
    ref: FirebaseFirestore.DocumentReference
  ): Promise<FirebaseFirestore.DocumentSnapshot> => ref.get();

  public getById = (id: string): Promise<FirebaseFirestore.DocumentSnapshot> =>
    this.getByRef(this.doc(id));

  public getByRefTransaction = (
    transaction: Transaction,
    ref: FirebaseFirestore.DocumentReference
  ): Promise<FirebaseFirestore.DocumentSnapshot> => transaction.get(ref);

  public getByIdTransaction = (
    transaction: Transaction,
    id: string
  ): Promise<FirebaseFirestore.DocumentSnapshot> =>
    this.getByRefTransaction(transaction, this.doc(id));

  public getDataByRef = (
    ref: FirebaseFirestore.DocumentReference
  ): Promise<WithId<TRead> | null> =>
    this.getByRef(ref).then(this.getDataFromSnapshot);

  public getDataById = (id: string): Promise<WithId<TRead> | null> =>
    this.getDataByRef(this.doc(id));

  public getDataByRefTransaction = (
    transaction: Transaction,
    ref: FirebaseFirestore.DocumentReference
  ): Promise<WithId<TRead> | null> =>
    this.getByRefTransaction(transaction, ref).then(this.getDataFromSnapshot);

  public getDataByIdTransaction = (
    transaction: Transaction,
    id: string
  ): Promise<WithId<TRead> | null> =>
    this.getDataByRefTransaction(transaction, this.doc(id));

  public getByRefs = (
    refs: FirebaseFirestore.DocumentReference[]
  ): Promise<FirebaseFirestore.DocumentSnapshot[]> =>
    refs.length ? this.fs.getAll(...refs) : Promise.resolve([]);

  public getByIds = (
    ids: string[]
  ): Promise<FirebaseFirestore.DocumentSnapshot[]> =>
    this.getByRefs(ids.map(this.doc));

  public getByRefsTransaction = (
    transaction: Transaction,
    refs: FirebaseFirestore.DocumentReference[]
  ): Promise<FirebaseFirestore.DocumentSnapshot[]> =>
    refs.length ? transaction.getAll(...refs) : Promise.resolve([]);

  public getByIdsTransaction = (
    transaction: Transaction,
    ids: string[]
  ): Promise<FirebaseFirestore.DocumentSnapshot[]> =>
    this.getByRefsTransaction(transaction, ids.map(this.doc));

  public getDataByRefs = (
    refs: FirebaseFirestore.DocumentReference[]
  ): Promise<Array<WithId<TRead> | null>> =>
    this.getByRefs(refs).then(this.getDataFromSnapshots);

  public getDataByIds = (ids: string[]): Promise<Array<WithId<TRead> | null>> =>
    this.getDataByRefs(ids.map(this.doc));

  public getDataByRefsTransaction = (
    transaction: Transaction,
    refs: FirebaseFirestore.DocumentReference[]
  ): Promise<Array<WithId<TRead> | null>> =>
    this.getByRefsTransaction(transaction, refs).then(
      this.getDataFromSnapshots
    );

  public getDataByIdsTransaction = (
    transaction: Transaction,
    ids: string[]
  ): Promise<Array<WithId<TRead> | null>> =>
    this.getDataByRefsTransaction(transaction, ids.map(this.doc));

  public create = async (
    data: TCreate
  ): Promise<{ id: string; writeResult: FirebaseFirestore.WriteResult }> => {
    const ref = this.newDoc();
    const writeResult = await ref.create(data);
    return {
      id: ref.id,
      writeResult,
    };
  };

  public createTransaction = (
    transaction: Transaction,
    data: TCreate
  ): FirebaseFirestore.DocumentReference => {
    const ref = this.newDoc();
    transaction.create(ref, data);
    return ref;
  };

  public createByRef = (
    ref: FirebaseFirestore.DocumentReference,
    data: TCreate
  ): Promise<FirebaseFirestore.WriteResult> => ref.create(data);

  public createById = (
    id: string,
    data: TCreate
  ): Promise<FirebaseFirestore.WriteResult> =>
    this.createByRef(this.doc(id), data);

  public createByRefTransaction = (
    transaction: Transaction,
    ref: FirebaseFirestore.DocumentReference,
    data: TCreate
  ): Transaction => transaction.create(ref, data);

  public createByIdTransaction = (
    transaction: Transaction,
    id: string,
    data: TCreate
  ): Transaction =>
    this.createByRefTransaction(transaction, this.doc(id), data);

  public setByRef = (
    ref: FirebaseFirestore.DocumentReference,
    data: TCreate,
    options?: FirebaseFirestore.SetOptions
  ): Promise<FirebaseFirestore.WriteResult> =>
    options ? ref.set(data, options) : ref.set(data);

  public setById = (
    id: string,
    data: TCreate,
    options?: FirebaseFirestore.SetOptions
  ): Promise<FirebaseFirestore.WriteResult> =>
    this.setByRef(this.doc(id), data, options);

  public setByRefTransaction = (
    transaction: Transaction,
    ref: FirebaseFirestore.DocumentReference,
    data: TCreate,
    options?: FirebaseFirestore.SetOptions
  ): Transaction =>
    options ? transaction.set(ref, data, options) : transaction.set(ref, data);

  public setByIdTransaction = (
    transaction: Transaction,
    id: string,
    data: TCreate,
    options?: FirebaseFirestore.SetOptions
  ): Transaction =>
    this.setByRefTransaction(transaction, this.doc(id), data, options);

  public upsertByRef = (
    ref: FirebaseFirestore.DocumentReference,
    data: TCreate,
    options?: FirebaseFirestore.SetOptions
  ): Promise<FirebaseFirestore.WriteResult> =>
    this.setByRef(ref, data, { ...options, merge: true });

  public upsertById = (
    id: string,
    data: TCreate,
    options?: FirebaseFirestore.SetOptions
  ): Promise<FirebaseFirestore.WriteResult> =>
    this.upsertByRef(this.doc(id), data, options);

  public upsertByRefTransaction = (
    transaction: Transaction,
    ref: FirebaseFirestore.DocumentReference,
    data: TCreate,
    options?: FirebaseFirestore.SetOptions
  ): Transaction =>
    this.setByRefTransaction(transaction, ref, data, {
      ...options,
      merge: true,
    });

  public upsertByIdTransaction = (
    transaction: Transaction,
    id: string,
    data: TCreate,
    options?: FirebaseFirestore.SetOptions
  ): Transaction =>
    this.upsertByRefTransaction(transaction, this.doc(id), data, options);

  public updateByRef = (
    ref: FirebaseFirestore.DocumentReference,
    data: TUpdate,
    precondition?: FirebaseFirestore.Precondition
  ): Promise<FirebaseFirestore.WriteResult> =>
    precondition ? ref.update(data, precondition) : ref.update(data);

  public updateById = (
    id: string,
    data: TUpdate,
    precondition?: FirebaseFirestore.Precondition
  ): Promise<FirebaseFirestore.WriteResult> =>
    this.updateByRef(this.doc(id), data, precondition);

  public updateByRefTransaction = (
    transaction: Transaction,
    ref: FirebaseFirestore.DocumentReference,
    data: TUpdate,
    precondition?: FirebaseFirestore.Precondition
  ): Transaction =>
    precondition
      ? transaction.update(ref, data, precondition)
      : transaction.update(ref, data);

  public updateByIdTransaction = (
    transaction: Transaction,
    id: string,
    data: TUpdate,
    precondition?: FirebaseFirestore.Precondition
  ): Transaction =>
    this.updateByRefTransaction(transaction, this.doc(id), data, precondition);

  public deleteByRef = (
    ref: FirebaseFirestore.DocumentReference,
    precondition?: FirebaseFirestore.Precondition
  ): Promise<FirebaseFirestore.WriteResult> =>
    precondition ? ref.delete(precondition) : ref.delete();

  public deleteById = (
    id: string,
    precondition?: FirebaseFirestore.Precondition
  ): Promise<FirebaseFirestore.WriteResult> =>
    this.deleteByRef(this.doc(id), precondition);

  public deleteByRefTransaction = (
    transaction: Transaction,
    ref: FirebaseFirestore.DocumentReference,
    precondition?: FirebaseFirestore.Precondition
  ): Transaction =>
    precondition
      ? transaction.delete(ref, precondition)
      : transaction.delete(ref);

  public deleteByIdTransaction = (
    transaction: Transaction,
    id: string,
    precondition?: FirebaseFirestore.Precondition
  ): Transaction =>
    this.deleteByRefTransaction(transaction, this.doc(id), precondition);

  public queryByUniqueField = <Key extends keyof TRead & string>(
    field: Key,
    value: TRead[Key]
  ): FirebaseFirestore.Query => this.colRef.where(field, '==', value).limit(1);

  public where = (
    conditions: IFirestoreWhereConditions<TRead>
  ): FirebaseFirestore.Query => {
    let query: FirebaseFirestore.Query = this.colRef;
    const fields = getKeys(conditions);
    const flen = fields.length;
    for (let i = 0; i < flen; i += 1) {
      const field = fields[i];
      const opToValue = conditions[field];
      if (opToValue != null) {
        const ops = getKeys(opToValue) as WhereFilterOp[];
        const olen = ops.length;
        for (let j = 0; j < olen; j += 1) {
          const op = ops[j];
          const value = opToValue[op];
          if (value !== undefined) {
            query = query.where(field, op, value);
          }
        }
      }
    }
    return query;
  };

  public findOne = (
    conditions: IFirestoreWhereConditions<TRead>
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> => {
    return this.where(conditions)
      .limit(1)
      .get()
      .then((s) => s.docs[0] || null);
  };

  public exists = (
    conditions: IFirestoreWhereConditions<TRead>
  ): Promise<boolean> => {
    return this.where(conditions)
      .limit(1)
      .get()
      .then((s) => s.size > 0);
  };

  public getByUniqueField = <Key extends keyof TRead & string>(
    field: Key,
    value: TRead[Key]
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> =>
    this.queryByUniqueField(field, value)
      .get()
      .then(getFirstQueryDocumentSnapshot);

  public getDataByUniqueField = <Key extends keyof TRead & string>(
    field: Key,
    value: TRead[Key]
  ): Promise<WithId<TRead> | null> =>
    this.getByUniqueField(field, value).then(this.getDataFromSnapshot);

  public incrementById = <Key extends keyof TRead & string>(
    id: string,
    field: Key,
    amount: TRead[Key] & number
  ): Promise<boolean> => {
    const ref = this.doc(id);
    let exists = false;
    return this.fs
      .runTransaction((t) => {
        return t.get(ref).then((doc) => {
          if (doc.exists) {
            exists = true;
            const data = doc.data() as TRead;
            const prevValue = ((data[field] as any) as number) || 0;
            t.update(ref, { [field]: prevValue + amount });
          }
        });
      })
      .then(() => exists);
  };

  public batchAll = (fns: BatchOp[]): Promise<void> =>
    batchFirestoreOps(this.fs, fns);

  public deleteAllDocuments = async (): Promise<void> => {
    const snapshot = await this.colRef.get();
    const batches: BatchOp[] = snapshot.docs.map(
      (doc): BatchOp => (batch): void => {
        batch.delete(this.doc(doc.id));
      }
    );
    if (batches.length) {
      await this.batchAll(batches);
    }
  };
}
