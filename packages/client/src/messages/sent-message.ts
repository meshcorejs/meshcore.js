import type { DeliveryFailedError } from '../errors.js';
import type { Channel } from '../structures/channel.js';
import type { Contact } from '../structures/contact.js';

export type SentMessageStatus = 'queued' | 'sent' | 'delivered' | 'failed';

type PartStatus = SentMessageStatus;

type Waiter = { resolve: () => void; reject: (error: Error) => void };

export class SentMessage {
  readonly target: Contact | Channel;
  readonly parts: readonly string[];
  readonly #partStatus: PartStatus[];
  #error: DeliveryFailedError | null = null;
  readonly #sentWaiters: Waiter[] = [];
  readonly #deliveredWaiters: Waiter[] = [];

  /**
   * @param target Contact or channel
   * @param parts Texts sent, one per radio message
   */
  constructor(target: Contact | Channel, parts: string[]) {
    this.target = target;
    this.parts = Object.freeze([...parts]);
    this.#partStatus = parts.map(() => 'queued');
  }

  get isDM(): boolean {
    return 'publicKey' in this.target;
  }

  get status(): SentMessageStatus {
    if (this.#error) return 'failed';
    if (this.#partStatus.every((s) => s === 'delivered')) return 'delivered';
    if (this.#partStatus.every((s) => s !== 'queued')) return 'sent';
    return 'queued';
  }

  get error(): DeliveryFailedError | null {
    return this.#error;
  }

  delivered(): Promise<void> {
    const done = this.isDM ? this.status === 'delivered' : this.status === 'sent' || this.status === 'delivered';
    return this.#wait(this.#deliveredWaiters, done);
  }

  /** @internal */
  _whenSent(): Promise<void> {
    return this.#wait(this.#sentWaiters, this.status === 'sent' || this.status === 'delivered');
  }

  /** @internal */
  _isPartDelivered(index: number): boolean {
    return this.#partStatus[index] === 'delivered';
  }

  /** @internal */
  _markPart(index: number, status: 'sent' | 'delivered'): boolean {
    if (this.#error || this.#partStatus[index] === 'delivered') return false;
    const before = this.status;
    this.#partStatus[index] = status;
    const after = this.status;
    if (before === 'queued' && after !== 'queued') {
      settle(this.#sentWaiters);
      if (!this.isDM) settle(this.#deliveredWaiters);
    }
    if (after === 'delivered' && before !== 'delivered') {
      settle(this.#deliveredWaiters);
      return true;
    }
    return false;
  }

  /** @internal */
  _fail(error: DeliveryFailedError): boolean {
    if (this.#error || this.status === 'delivered') return false;
    this.#error = error;
    settle(this.#sentWaiters, error);
    settle(this.#deliveredWaiters, error);
    return true;
  }

  #wait(waiters: Waiter[], done: boolean): Promise<void> {
    if (this.#error) return Promise.reject(this.#error);
    if (done) return Promise.resolve();
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  }
}

function settle(waiters: Waiter[], error?: Error): void {
  for (const waiter of waiters.splice(0)) {
    if (error) waiter.reject(error);
    else waiter.resolve();
  }
}
