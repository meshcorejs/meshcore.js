import type { TypedEmitter } from './typed-emitter.js';

/** Which kind of {@link Transport} an instance is: `'serial'`, `'tcp'`, `'ble'` or `'mock'`. */
export type TransportKind = 'serial' | 'tcp' | 'ble' | 'mock';

/** Events a {@link Transport} emits: `frame` per decoded payload, `close` on an unexpected disconnection. */
export interface TransportEvents extends Record<string, unknown[]> {
  frame: [payload: Uint8Array];
  close: [error?: Error];
}

/** What the `Client` talks to the radio through: connect, write one frame payload, receive `frame` events, and `close`. Transports add and strip the framing of their medium; reconnection and protocol belong to the client. */
export interface Transport extends TypedEmitter<TransportEvents> {
  readonly kind: TransportKind;
  readonly connected: boolean;
  connect(signal?: AbortSignal): Promise<void>;
  write(payload: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
