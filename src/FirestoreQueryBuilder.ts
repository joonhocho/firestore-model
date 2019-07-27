import { Transaction } from '@google-cloud/firestore';
import {
  firestoreWhere,
  getFirstQueryDocumentSnapshot,
  getQueryDocumentSnapshots,
  getQueryIsNotEmpty,
  getQuerySize,
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
    if (count !== this._limit) {
      this._limit = count;
      this.query = this.query.limit(count);
    }
    return this;
  }

  public getQuerySnapshot(): Promise<FirebaseFirestore.QuerySnapshot> {
    const { tx } = this;
    return tx ? tx.get(this.query) : this.query.get();
  }

  public exists(): Promise<boolean> {
    return this.limit(1)
      .getQuerySnapshot()
      .then(getQueryIsNotEmpty);
  }

  public count(limit?: number): Promise<number> {
    if (limit != null) {
      this.limit(limit);
    }
    return this.getQuerySnapshot().then(getQuerySize);
  }

  public getDocumentSnapshots(): Promise<
    FirebaseFirestore.QueryDocumentSnapshot[]
  > {
    return this.getQuerySnapshot().then(getQueryDocumentSnapshots);
  }

  public getOneDocumentSnapshot(): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
    return this.limit(1)
      .getQuerySnapshot()
      .then(getFirstQueryDocumentSnapshot);
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
