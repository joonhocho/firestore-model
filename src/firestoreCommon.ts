import { Transaction, WhereFilterOp } from '_deps/@google-cloud/firestore';
import { ItemType } from './ts';
import { getKeys } from './util';

export type IFirestoreWhereConditions<TData> = Partial<
  {
    [key in keyof TData & string]: Partial<
      {
        [op in Exclude<WhereFilterOp, 'array-contains' | 'in'> &
          string]: TData[key];
      }
    > &
      Partial<{
        ['in']: Array<TData[key]>;
        ['array-contains']: ItemType<TData[key]>;
      }>;
  }
>;

export const firestoreWhere = <TRead>(
  query: FirebaseFirestore.Query,
  conditions: IFirestoreWhereConditions<TRead>
): FirebaseFirestore.Query => {
  let nextQuery = query;
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
          nextQuery = nextQuery.where(field, op, value);
        }
      }
    }
  }
  return nextQuery;
};

export type BatchOp = (x: FirebaseFirestore.WriteBatch) => void;

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

export const getFirstQueryDocumentSnapshot = (
  snapshot: FirebaseFirestore.QuerySnapshot
): FirebaseFirestore.QueryDocumentSnapshot | null =>
  snapshot.empty ? null : snapshot.docs[0];

export const getQueryDocumentSnapshots = (
  snapshot: FirebaseFirestore.QuerySnapshot
): FirebaseFirestore.QueryDocumentSnapshot[] => snapshot.docs;

export const isQuerySnapshotNotEmpty = (
  s: FirebaseFirestore.QuerySnapshot
): boolean => s.size > 0;

export const getQueryResult = (
  query: FirebaseFirestore.Query,
  transaction?: Transaction
): Promise<FirebaseFirestore.QuerySnapshot> => {
  if (transaction) {
    return transaction.get(query);
  }
  return query.get();
};

export const getQueryIsEmpty = (
  snapshot: FirebaseFirestore.QuerySnapshot
): boolean => snapshot.size === 0;

export const getQueryIsNotEmpty = (
  snapshot: FirebaseFirestore.QuerySnapshot
): boolean => snapshot.size > 0;

export const getQuerySize = (
  snapshot: FirebaseFirestore.QuerySnapshot
): number => snapshot.size;

export const getQuerySnapshotData = <TData, IDKey extends string = 'id'>(
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  idKey: IDKey = 'id' as any
): TData & { [key in IDKey]: string } => {
  const data = snapshot.data() as TData & { [key in IDKey]: string };
  if (typeof data[idKey] === 'undefined') {
    data[idKey] = snapshot.id as any;
  }
  return data;
};

export const getSnapshotData = <TData, IDKey extends string = 'id'>(
  snapshot: FirebaseFirestore.DocumentSnapshot | null | undefined,
  idKey: IDKey = 'id' as any
): (TData & { [key in IDKey]: string }) | null => {
  if (snapshot != null && snapshot.exists) {
    return getQuerySnapshotData(
      snapshot as FirebaseFirestore.QueryDocumentSnapshot,
      idKey
    );
  }
  return null;
};

// tslint:disable-next-line typedef
export const getQuerySnapshotDataGetter = <IDKey extends string>(
  idKey: IDKey
) => <TData>(
  snapshot: FirebaseFirestore.QueryDocumentSnapshot
): TData & { [key in IDKey]: string } => getQuerySnapshotData(snapshot, idKey);

// tslint:disable-next-line typedef
export const getSnapshotDataGetter = <IDKey extends string>(idKey: IDKey) => <
  TData
>(
  snapshot: FirebaseFirestore.DocumentSnapshot
): (TData & { [key in IDKey]: string }) | null =>
  getSnapshotData(snapshot, idKey);

export const getSnapshotDataWithId = getSnapshotDataGetter('id');

export const mapQueryDocumentSnapshots = <T>(
  snapshot: FirebaseFirestore.QuerySnapshot,
  map: (doc: FirebaseFirestore.QueryDocumentSnapshot) => T
): T[] => snapshot.docs.map(map);

// tslint:disable-next-line typedef
export const getQueryDocumentSnapshotsMapper = <T>(
  map: (doc: FirebaseFirestore.QueryDocumentSnapshot) => T
) => (snapshot: FirebaseFirestore.QuerySnapshot): T[] => snapshot.docs.map(map);
