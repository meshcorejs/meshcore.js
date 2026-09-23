import type { DecodedFrame } from '@meshcorejs/protocol';
import { CommandTimeoutError, RadioError } from '../errors.js';

/**
 * Decides what a request does with each response frame: `{ value }` resolves it, `'continue'` keeps waiting
 * (multi-frame answers), `'ignore'` leaves the frame to others.
 */
export type Collector<T> = (frame: DecodedFrame) => { value: T } | 'continue' | 'ignore';

interface PendingRequest {
  name: string;
  payload: Uint8Array;
  collect: Collector<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

export class RequestQueue {
  readonly #write: (payload: Uint8Array) => Promise<void>;
  readonly #timeoutMs: number;
  readonly #waiting: PendingRequest[] = [];
  #active: PendingRequest | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(write: (payload: Uint8Array) => Promise<void>, timeoutMs = 5000) {
    this.#write = write;
    this.#timeoutMs = timeoutMs;
  }

  get size(): number {
    return this.#waiting.length + (this.#active ? 1 : 0);
  }

  request<T>(name: string, payload: Uint8Array, collect: Collector<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.#waiting.push({ name, payload, collect, resolve: resolve as (value: unknown) => void, reject });
      this.#pump();
    });
  }

  handleResponse(frame: DecodedFrame): boolean {
    const active = this.#active;
    if (!active) return false;
    if (frame.type === 'err') {
      this.#finish(active, () => active.reject(new RadioError(active.name, frame.errorCode)));
      return true;
    }
    if (frame.type === 'disabled') {
      this.#finish(active, () => active.reject(new RadioError(active.name, null, 'disabled on this radio')));
      return true;
    }
    const result = active.collect(frame);
    if (result === 'ignore') return false;
    if (result === 'continue') {
      this.#startTimer(active);
      return true;
    }
    this.#finish(active, () => active.resolve(result.value));
    return true;
  }

  rejectAll(error: Error): void {
    const all = [...(this.#active ? [this.#active] : []), ...this.#waiting.splice(0)];
    this.#clearTimer();
    this.#active = null;
    for (const request of all) request.reject(error);
  }

  #pump(): void {
    if (this.#active) return;
    const next = this.#waiting.shift();
    if (!next) return;
    this.#active = next;
    this.#startTimer(next);
    this.#write(next.payload).catch((error: unknown) => {
      if (this.#active === next) this.#finish(next, () => next.reject(error));
    });
  }

  #startTimer(request: PendingRequest): void {
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      if (this.#active !== request) return;
      this.#finish(request, () => request.reject(new CommandTimeoutError(request.name, this.#timeoutMs)));
    }, this.#timeoutMs);
  }

  #clearTimer(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #finish(request: PendingRequest, settle: () => void): void {
    if (this.#active !== request) return;
    this.#clearTimer();
    this.#active = null;
    settle();
    this.#pump();
  }
}
