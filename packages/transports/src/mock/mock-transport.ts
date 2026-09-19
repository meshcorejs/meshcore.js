import { ConnectionError } from '../errors.js';
import type { Transport, TransportEvents } from '../transport.js';
import { TypedEmitter } from '../typed-emitter.js';

export type RadioHandler = (payload: Uint8Array, transport: MockTransport) => void;

export class MockTransport extends TypedEmitter<TransportEvents> implements Transport {
  readonly kind = 'mock';
  readonly written: Uint8Array[] = [];
  #connected = false;
  #handler: RadioHandler | null = null;
  #nextConnectError: Error | null = null;
  connectCount = 0;

  get connected(): boolean {
    return this.#connected;
  }

  /** @param handler Answers the written frames, or null */
  setRadio(handler: RadioHandler | null): void {
    this.#handler = handler;
  }

  /** @param error Rejection of the next connect. Default a ConnectionError */
  failNextConnect(error: Error = new ConnectionError('mock connect failure')): void {
    this.#nextConnectError = error;
  }

  /** @param signal Aborts the connection attempt */
  async connect(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.#connected) throw new ConnectionError('mock transport is already connected');
    this.connectCount++;
    const error = this.#nextConnectError;
    if (error) {
      this.#nextConnectError = null;
      throw error;
    }
    this.#connected = true;
  }

  /** @param payload Frame payload without framing */
  async write(payload: Uint8Array): Promise<void> {
    if (!this.#connected) throw new ConnectionError('mock transport is not connected');
    this.written.push(payload);
    this.#handler?.(payload, this);
  }

  async close(): Promise<void> {
    this.#connected = false;
  }

  /** @param payload Frame payload from the radio */
  receive(payload: Uint8Array): void {
    queueMicrotask(() => {
      if (this.#connected) this.emit('frame', payload);
    });
  }

  /** @param error Reason given to the close event */
  simulateDisconnect(error: Error = new ConnectionError('mock connection lost')): void {
    if (!this.#connected) return;
    this.#connected = false;
    this.emit('close', error);
  }
}
