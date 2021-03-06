import { database } from 'firebase-admin';

type WithId<TData> = TData & { id: string };

export class FirebaseCollection<TData extends {}, TCreate = TData> {
  public colRef: database.Reference;

  constructor(public db: database.Database, public collectionName: string) {
    this.colRef = db.ref(collectionName);
  }

  public getDataFromSnapshot = (
    snapshot: database.DataSnapshot | null
  ): WithId<TData> | null => {
    if (snapshot) {
      if (snapshot.exists()) {
        const data = snapshot.val() as WithId<TData>;
        if (typeof data.id === 'undefined') {
          data.id = snapshot.key!;
        }
        return data;
      }
    }
    return null;
  };

  public getDataFromSnapshots = (
    snapshots: Array<database.DataSnapshot | null>
  ): Array<WithId<TData> | null> => snapshots.map(this.getDataFromSnapshot);

  public getFirstDataFromSnapshot = (
    snapshot: database.DataSnapshot
  ): TData | null => {
    const data = snapshot.val();
    return data.length > 0 ? (data[0] as TData) : null;
  };

  public doc = (id: string): database.Reference => this.colRef.child(id);

  public newDoc = (): database.Reference => this.colRef.push();

  public getById = (id: string): Promise<database.DataSnapshot> =>
    this.colRef.child(id).once('value');

  public getDataById = (id: string): Promise<WithId<TData> | null> =>
    this.getById(id).then(this.getDataFromSnapshot);

  public getByIds = (ids: string[]): Promise<database.DataSnapshot[]> =>
    Promise.all(ids.map(this.getById));

  public getDataByIds = (ids: string[]): Promise<Array<WithId<TData> | null>> =>
    this.getByIds(ids).then(this.getDataFromSnapshots);

  public create = async (data: TCreate): Promise<{ id: string }> => {
    const ref = this.colRef.push();
    await ref.set(data);
    return { id: ref.key! };
  };

  public setById = (id: string, data: TCreate): Promise<void> =>
    this.colRef.child(id).set(data);

  public upsertById = (id: string, data: TCreate): Promise<void> =>
    this.colRef.child(id).update(data as any);

  public deleteById = (id: string): Promise<void> =>
    this.colRef.child(id).remove();

  public queryByUniqueField = <Key extends keyof TData & string>(
    field: Key,
    value: TData[Key]
  ): database.Query =>
    this.colRef
      .orderByChild(field)
      .equalTo(value as any)
      .limitToFirst(1);

  public getDataByUniqueField = <Key extends keyof TData & string>(
    field: Key,
    value: TData[Key]
  ): Promise<TData | null> =>
    this.queryByUniqueField(field, value)
      .once('value')
      .then(this.getFirstDataFromSnapshot);

  public deleteAllDocuments = async (): Promise<void> => this.colRef.remove();
}
