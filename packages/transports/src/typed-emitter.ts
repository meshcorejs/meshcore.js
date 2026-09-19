import { EventEmitter } from 'node:events';

export type EventMap = Record<string, unknown[]>;

export type Listener<Args extends unknown[]> = (...args: Args) => void;

export class TypedEmitter<Events extends EventMap> {
  readonly #emitter = new EventEmitter();

  /**
   * @param event Event name
   * @param listener Called with the event arguments
   */
  on<K extends keyof Events & string>(event: K, listener: Listener<Events[K]>): this {
    this.#emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * @param event Event name
   * @param listener Called once with the event arguments
   */
  once<K extends keyof Events & string>(event: K, listener: Listener<Events[K]>): this {
    this.#emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * @param event Event name
   * @param listener Listener to remove
   */
  off<K extends keyof Events & string>(event: K, listener: Listener<Events[K]>): this {
    this.#emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * @param event Event name
   * @param args Event arguments
   */
  emit<K extends keyof Events & string>(event: K, ...args: Events[K]): boolean {
    return this.#emitter.emit(event, ...args);
  }

  /** @param event Event name */
  listenerCount<K extends keyof Events & string>(event: K): number {
    return this.#emitter.listenerCount(event);
  }

  /** @param event Event name, or every event when omitted */
  removeAllListeners<K extends keyof Events & string>(event?: K): this {
    if (event === undefined) this.#emitter.removeAllListeners();
    else this.#emitter.removeAllListeners(event);
    return this;
  }
}
