import { Transaction } from '_deps/@google-cloud/firestore';

export type FirestoreTransactionRead<Input, ReadData> = (
  tx: Transaction,
  input: Input
) => Promise<ReadData>;

export type FirestoreTransactionWrite<Input, ReadData, Output> = (
  tx: Transaction,
  input: Input,
  data: ReadData
) => Output | Promise<Output>;

export class FirestoreTransaction<Input, Output, ReadData> {
  public _input!: Input;
  public _output!: Output;
  public _readData!: ReadData;

  constructor(
    public read: FirestoreTransactionRead<Input, ReadData>,
    public write: FirestoreTransactionWrite<Input, ReadData, Output>
  ) {}

  public async run(tx: Transaction, input: Input): Promise<Output> {
    const data = await this.read(tx, input);
    return this.write(tx, input, data);
  }
}

export const composeFirestoreTransactions = <
  T extends { [key: string]: FirestoreTransaction<any, any, any> }
>(
  transactions: T
): FirestoreTransaction<
  { [K in keyof T & string]: T[K]['_input'] },
  { [K in keyof T & string]: T[K]['_output'] },
  Array<T[keyof T & string]['_readData']>
> => {
  const keys = Object.keys(transactions) as Array<keyof T & string>;
  return new FirestoreTransaction(
    (tx, input): Promise<Array<T[keyof T & string]['_readData']>> =>
      // tslint:disable-next-line: typedef
      Promise.all(keys.map((key) => transactions[key].read(tx, input[key]))),

    (tx, input, data): { [K in keyof T & string]: T[K]['_output'] } => {
      const output = {} as { [K in keyof T]: T[K]['_output'] };
      for (let i = 0, len = keys.length; i < len; i += 1) {
        const key = keys[i];
        output[key] = transactions[key].write(tx, input[key], data[i]);
      }
      return output;
    }
  );
};
