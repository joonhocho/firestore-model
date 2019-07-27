import { Transaction } from '@google-cloud/firestore';
import {
  firestoreWhere,
  getFirstQueryDocumentSnapshot,
  getQueryDocumentSnapshots,
  getQuerySnapshotDataGetter,
  getSnapshotData,
  IFirestoreWhereConditions,
} from './firestoreCommon';

export interface IFirestoreQueryBuilderOptions<IDKey extends string = 'id'> {
  tx?: Transaction;
  idKey?: IDKey;
}

export class FirestoreQueryBuilder<T, IDKey extends string = 'id'> {
  public query: FirebaseFirestore.Query;
  public _limit?: number;
  public tx?: Transaction;
  public idKey: IDKey;
  public getQuerySnapshotData: (
    snapshot: FirebaseFirestore.QueryDocumentSnapshot
  ) => T & { [key in IDKey]: string };

  constructor(
    public colRef: FirebaseFirestore.CollectionReference,
    options?: IFirestoreQueryBuilderOptions<IDKey>
  ) {
    this.query = colRef;
    this.tx = options && options.tx;
    this.idKey = (options && options.idKey) || ('id' as any);
    this.getQuerySnapshotData = getQuerySnapshotDataGetter(this.idKey);
  }

  public where = (conditions: IFirestoreWhereConditions<T>): this => {
    this.query = firestoreWhere(this.query, conditions);
    return this;
  };

  public limit(count: number): this {
    this._limit = count;
    this.query = this.query.limit(count);
    return this;
  }

  public getQuerySnapshot(): Promise<FirebaseFirestore.QuerySnapshot> {
    if (this.tx) {
      return this.tx.get(this.query);
    }
    return this.query.get();
  }

  public getDocumentSnapshots(): Promise<
    FirebaseFirestore.QueryDocumentSnapshot[]
  > {
    return this.getQuerySnapshot().then(getQueryDocumentSnapshots);
  }

  public getOneDocumentSnapshot(): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
    if (this._limit !== 1) {
      this.limit(1);
    }
    return this.getQuerySnapshot().then(getFirstQueryDocumentSnapshot);
  }

  public getDataList(): Promise<Array<T & { [K in IDKey]: string }>> {
    return this.getQuerySnapshot().then((s) =>
      s.docs.map(this.getQuerySnapshotData)
    );
  }

  public getOneData(): Promise<(T & { [K in IDKey]: string }) | null> {
    return this.getOneDocumentSnapshot().then((s) =>
      getSnapshotData(s, this.idKey)
    );
  }
}
