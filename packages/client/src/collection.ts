/**
 * A `Map` with array-like read helpers (`find`, `filter`, `map`, `some`, `every`, `first`, `toArray`, `sorted`);
 * every manager's cache (`client.contacts`, `client.channels`, …) is one of these.
 */
export class Collection<K, V> extends Map<K, V> {
  /** Returns the first value for which `predicate(value, key)` is true, or `undefined`. */
  find(predicate: (value: V, key: K) => boolean): V | undefined {
    for (const [key, value] of this) if (predicate(value, key)) return value;
    return undefined;
  }

  /** Returns a new `Collection` with only the entries for which `predicate(value, key)` is true. */
  filter(predicate: (value: V, key: K) => boolean): Collection<K, V> {
    const result = new Collection<K, V>();
    for (const [key, value] of this) if (predicate(value, key)) result.set(key, value);
    return result;
  }

  /** Applies `mapper(value, key)` to every entry and returns the results as an array. */
  map<T>(mapper: (value: V, key: K) => T): T[] {
    const result: T[] = [];
    for (const [key, value] of this) result.push(mapper(value, key));
    return result;
  }

  /** True if `predicate(value, key)` holds for at least one entry. */
  some(predicate: (value: V, key: K) => boolean): boolean {
    return this.find(predicate) !== undefined;
  }

  /** True if `predicate(value, key)` holds for every entry (vacuously true when empty). */
  every(predicate: (value: V, key: K) => boolean): boolean {
    for (const [key, value] of this) if (!predicate(value, key)) return false;
    return true;
  }

  /** The first value in insertion order, or `undefined` if the collection is empty. */
  first(): V | undefined {
    return this.values().next().value;
  }

  /** All values as a plain array, in insertion order. */
  toArray(): V[] {
    return [...this.values()];
  }

  /** All values as a plain array, sorted with `compare` (same contract as `Array.prototype.sort`). */
  sorted(compare: (a: V, b: V) => number): V[] {
    return this.toArray().sort(compare);
  }
}
