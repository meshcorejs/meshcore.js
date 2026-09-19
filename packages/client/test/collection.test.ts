import { describe, expect, it } from 'vitest';
import { Collection } from '../src/collection.js';

const numbers = () =>
  new Collection<string, number>([
    ['a', 3],
    ['b', 1],
    ['c', 2],
  ]);

describe('Collection', () => {
  it('finds, filters and maps values', () => {
    const collection = numbers();
    expect(collection.find((value) => value > 1)).toBe(3);
    expect([...collection.filter((value) => value > 1).keys()]).toEqual(['a', 'c']);
    expect(collection.filter(() => true)).toBeInstanceOf(Collection);
    expect(collection.map((value, key) => `${key}${value}`)).toEqual(['a3', 'b1', 'c2']);
  });

  it('answers some/every, first, toArray and sorted', () => {
    const collection = numbers();
    expect(collection.some((value) => value === 2)).toBe(true);
    expect(collection.every((value) => value > 1)).toBe(false);
    expect(collection.first()).toBe(3);
    expect(new Collection().first()).toBeUndefined();
    expect(collection.toArray()).toEqual([3, 1, 2]);
    expect(collection.sorted((x, y) => x - y)).toEqual([1, 2, 3]);
  });
});
