export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export class History {
  readonly #entries = new Map<string, { turns: Turn[]; expiresAt: number }>();
  readonly #max: number;
  readonly #ttlMs: number;
  readonly #now: () => number;

  /**
   * @param max Exchanges kept per key (an exchange is a user turn and an assistant turn)
   * @param ttlMs Milliseconds after the last push before the key is forgotten
   * @param now Clock, for tests
   */
  constructor(max: number, ttlMs: number, now: () => number = Date.now) {
    this.#max = max;
    this.#ttlMs = ttlMs;
    this.#now = now;
  }

  /**
   * The turns kept for `key`, oldest first, as a fresh array.
   * @param key Author key
   */
  get(key: string): Turn[] {
    const entry = this.#entries.get(key);
    if (!entry) return [];
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return [];
    }
    return [...entry.turns];
  }

  /**
   * @param key Author key
   * @param turns Turns to append
   */
  push(key: string, ...turns: Turn[]): void {
    if (this.#max === 0) return;
    const kept = [...this.get(key), ...turns].slice(-this.#max * 2);
    this.#entries.set(key, { turns: kept, expiresAt: this.#now() + this.#ttlMs });
  }
}
