import type { TypedEmitter } from './typed-emitter.js';

export type TransportKind = 'serial' | 'tcp' | 'ble' | 'mock';

export interface TransportEvents extends Record<string, unknown[]> {
  frame: [payload: Uint8Array];
  close: [error?: Error];
}

export interface Transport extends TypedEmitter<TransportEvents> {
  readonly kind: TransportKind;
  readonly connected: boolean;
  connect(signal?: AbortSignal): Promise<void>;
  write(payload: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
