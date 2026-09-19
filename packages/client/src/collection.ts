export class Collection<K, V> extends Map<K, V> {
  /** @param predicate Receives the value and the key */
  find(predicate: (value: V, key: K) => boolean): V | undefined {
    for (const [key, value] of this) if (predicate(value, key)) return value;
    return undefined;
  }

  /** @param predicate Receives the value and the key */
  filter(predicate: (value: V, key: K) => boolean): Collection<K, V> {
    const result = new Collection<K, V>();
    for (const [key, value] of this) if (predicate(value, key)) result.set(key, value);
    return result;
  }

  /** @param mapper Receives the value and the key */
  map<T>(mapper: (value: V, key: K) => T): T[] {
    const result: T[] = [];
    for (const [key, value] of this) result.push(mapper(value, key));
    return result;
  }

  /** @param predicate Receives the value and the key */
  some(predicate: (value: V, key: K) => boolean): boolean {
    return this.find(predicate) !== undefined;
  }

  /** @param predicate Receives the value and the key */
  every(predicate: (value: V, key: K) => boolean): boolean {
    for (const [key, value] of this) if (!predicate(value, key)) return false;
    return true;
  }

  first(): V | undefined {
    return this.values().next().value;
  }

  toArray(): V[] {
    return [...this.values()];
  }

  /** @param compare Sort function */
  sorted(compare: (a: V, b: V) => number): V[] {
    return this.toArray().sort(compare);
  }
}
