// tslint:disable: typedef
import { getKeys } from './util';

test('getKeys', () => {
  expect(getKeys({ a: 1, b: 1 })).toEqual(['a', 'b']);
});
