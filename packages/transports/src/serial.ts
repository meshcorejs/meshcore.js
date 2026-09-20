import { encodeFrame, FrameDecoder } from '@meshcorejs/protocol';
import { ConnectionError } from './errors.js';
import { importOptional } from './optional-import.js';
import type { Transport, TransportEvents } from './transport.js';
import { TypedEmitter } from './typed-emitter.js';

/** The part of a `serialport` port `SerialTransport` uses; lets tests inject a fake. */
export interface SerialPortLike {
  open(callback: (error: Error | null) => void): void;
  write(data: Uint8Array, callback: (error: Error | null | undefined) => void): boolean;
  close(callback: (error: Error | null) => void): void;
  on(event: 'data', listener: (chunk: Uint8Array) => void): unknown;
  on(event: 'close', listener: (error?: Error | null) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  removeAllListeners(): unknown;
}

/** The part of the `serialport` module `SerialTransport` uses. */
export interface SerialPortModule {
  SerialPort: new (options: { path: string; baudRate: number; autoOpen: boolean }) => SerialPortLike;
}

/** The serial device (`/dev/ttyACM0`, `COM3`) and its baud rate (default 115200). */
export interface SerialTransportOptions {
  path: string;
  baudRate?: number;
}

/** Test hook: how `SerialTransport` loads the module (defaults to the optional dependency `serialport`). */
export interface SerialTransportDeps {
  loadModule?: () => Promise<SerialPortModule>;
}

/** Transport over USB serial with the `'<'` / `'>'` framing. Needs `serialport` installed. */
export class SerialTransport extends TypedEmitter<TransportEvents> implements Transport {
  readonly kind = 'serial';
  readonly path: string;
  readonly baudRate: number;
  readonly #loadModule: () => Promise<SerialPortModule>;
  readonly #decoder = new FrameDecoder('fromRadio');
  #port: SerialPortLike | null = null;

  /**
   * @param options path and baudRate. Default 115200
   * @param deps Test seam replacing the serialport import
   */
  constructor(options: SerialTransportOptions, deps: SerialTransportDeps = {}) {
    super();
    this.path = options.path;
    this.baudRate = options.baudRate ?? 115_200;
    this.#loadModule = deps.loadModule ?? (() => importOptional<SerialPortModule>('serialport'));
  }

  get connected(): boolean {
    return this.#port !== null;
  }

  /** @param signal Aborts the connection attempt */
  async connect(signal?: AbortSignal): Promise<void> {
    if (this.#port) throw new ConnectionError('serial transport is already connected');
    signal?.throwIfAborted();
    const { SerialPort } = await this.#loadModule();
    signal?.throwIfAborted();
    this.#decoder.reset();

    const port = new SerialPort({ path: this.path, baudRate: this.baudRate, autoOpen: false });
    await new Promise<void>((resolve, reject) => {
      port.open((error) => {
        if (error)
          reject(new ConnectionError(`cannot open serial port ${this.path}: ${error.message}`, { cause: error }));
        else resolve();
      });
    });
    if (signal?.aborted) {
      await new Promise<void>((resolve) => port.close(() => resolve()));
      signal.throwIfAborted();
    }

    this.#port = port;
    let lastError: Error | undefined;
    port.on('data', (chunk) => {
      for (const frame of this.#decoder.push(chunk)) this.emit('frame', frame);
    });
    port.on('error', (error) => {
      lastError = error;
    });
    port.on('close', (error) => {
      if (this.#port !== port) return;
      this.#port = null;
      port.removeAllListeners();
      this.emit('close', error ?? lastError ?? new ConnectionError(`serial port ${this.path} closed`));
    });
  }

  /** @param payload Frame payload without framing */
  write(payload: Uint8Array): Promise<void> {
    const port = this.#port;
    if (!port) return Promise.reject(new ConnectionError('serial transport is not connected'));
    const frame = encodeFrame(payload, 'toRadio');
    return new Promise((resolve, reject) => {
      port.write(frame, (error) => {
        if (error) reject(new ConnectionError(`serial write failed: ${error.message}`, { cause: error }));
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    const port = this.#port;
    if (!port) return;
    this.#port = null;
    port.removeAllListeners();
    await new Promise<void>((resolve) => port.close(() => resolve()));
  }
}
