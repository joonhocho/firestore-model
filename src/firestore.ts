import { FieldValue, WhereFilterOp } from '@google-cloud/firestore';
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

export type IFirestoreWhereConditions<TData> = Partial<
  {
    [key in keyof TData & string]: Partial<
      { [op in WhereFilterOp & string]: TData[key] }
    >
  }
>;

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

  public newDoc = (): FirebaseFirestore.DocumentReference => this.colRef.doc();

  public getById = (id: string): Promise<FirebaseFirestore.DocumentSnapshot> =>
    this.colRef.doc(id).get();

  public getDataById = (id: string): Promise<WithId<TRead> | null> =>
    this.getById(id).then(this.getDataFromSnapshot);

  public getByIds = (
    ids: string[]
  ): Promise<FirebaseFirestore.DocumentSnapshot[]> =>
    ids.length
      ? (this.fs.getAll as any)(...ids.map(this.doc))
      : Promise.resolve([]);

  public getDataByIds = (ids: string[]): Promise<Array<WithId<TRead> | null>> =>
    this.getByIds(ids).then(this.getDataFromSnapshots);

  public create = async (
    data: TCreate
  ): Promise<{ id: string; writeResult: FirebaseFirestore.WriteResult }> => {
    const ref = this.colRef.doc();
    const writeResult = await ref.create(data);
    return {
      id: ref.id,
      writeResult,
    };
  };

  public createById = (
    id: string,
    data: TCreate
  ): Promise<FirebaseFirestore.WriteResult> => this.colRef.doc(id).create(data);

  public setById = (
    id: string,
    data: TCreate,
    options?: FirebaseFirestore.SetOptions
  ): Promise<FirebaseFirestore.WriteResult> =>
    options
      ? this.colRef.doc(id).set(data, options)
      : this.colRef.doc(id).set(data);

  public upsertById = (
    id: string,
    data: TCreate,
    options?: FirebaseFirestore.SetOptions
  ): Promise<FirebaseFirestore.WriteResult> =>
    this.setById(id, data, { ...options, merge: true });

  public updateById = (
    id: string,
    data: TUpdate,
    precondition?: FirebaseFirestore.Precondition
  ): Promise<FirebaseFirestore.WriteResult> =>
    precondition
      ? this.colRef.doc(id).update(data, precondition)
      : this.colRef.doc(id).update(data);

  public deleteById = (
    id: string,
    precondition?: FirebaseFirestore.Precondition
  ): Promise<FirebaseFirestore.WriteResult> =>
    precondition
      ? this.colRef.doc(id).delete(precondition)
      : this.colRef.doc(id).delete();

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
        batch.delete(this.colRef.doc(doc.id));
      }
    );
    if (batches.length) {
      await this.batchAll(batches);
    }
  };
}
