export type ItemType<T> = T extends Array<infer I> ? I : never;
