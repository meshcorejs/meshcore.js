import { connect as netConnect, type Socket } from 'node:net';
import { encodeFrame, FrameDecoder } from '@meshcorejs/protocol';
import { ConnectionError } from './errors.js';
import type { Transport, TransportEvents } from './transport.js';
import { TypedEmitter } from './typed-emitter.js';

/** The radio's host, its port (default 5000) and the connect timeout. */
export interface TcpTransportOptions {
  host: string;
  port?: number;
  connectTimeoutMs?: number;
}

/** Transport over WiFi (TCP) with the `'<'` / `'>'` framing. Needs nothing installed. */
export class TcpTransport extends TypedEmitter<TransportEvents> implements Transport {
  readonly kind = 'tcp';
  readonly host: string;
  readonly port: number;
  readonly #connectTimeoutMs: number;
  readonly #decoder = new FrameDecoder('fromRadio');
  #socket: Socket | null = null;

  /** @param options host and port. Default port 5000 */
  constructor(options: TcpTransportOptions) {
    super();
    this.host = options.host;
    this.port = options.port ?? 5000;
    this.#connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
  }

  get connected(): boolean {
    return this.#socket !== null;
  }

  /** @param signal Aborts the connection attempt */
  async connect(signal?: AbortSignal): Promise<void> {
    if (this.#socket) throw new ConnectionError('TCP transport is already connected');
    signal?.throwIfAborted();
    this.#decoder.reset();

    const socket = await this.#open(signal);
    this.#socket = socket;
    let lastError: Error | undefined;

    socket.on('data', (chunk: Buffer) => {
      for (const frame of this.#decoder.push(chunk)) this.emit('frame', frame);
    });
    socket.on('error', (error) => {
      lastError = error;
    });
    socket.on('close', () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.emit('close', lastError ?? new ConnectionError(`TCP connection to ${this.host}:${this.port} closed`));
    });
  }

  #open(signal?: AbortSignal): Promise<Socket> {
    const target = `${this.host}:${this.port}`;
    return new Promise((resolve, reject) => {
      const socket = netConnect({ host: this.host, port: this.port });
      socket.setNoDelay(true);

      const cleanup = () => {
        clearTimeout(timer);
        socket.off('connect', onConnect);
        socket.off('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };
      const fail = (error: unknown) => {
        cleanup();
        socket.destroy();
        reject(error);
      };
      const onConnect = () => {
        cleanup();
        resolve(socket);
      };
      const onError = (error: Error) =>
        fail(new ConnectionError(`TCP connection to ${target} failed: ${error.message}`, { cause: error }));
      const onAbort = () => fail(signal?.reason);
      const timer = setTimeout(
        () => fail(new ConnectionError(`TCP connection to ${target} timed out after ${this.#connectTimeoutMs} ms`)),
        this.#connectTimeoutMs,
      );

      socket.once('connect', onConnect);
      socket.once('error', onError);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** @param payload Frame payload without framing */
  write(payload: Uint8Array): Promise<void> {
    const socket = this.#socket;
    if (!socket) return Promise.reject(new ConnectionError('TCP transport is not connected'));
    const frame = encodeFrame(payload, 'toRadio');
    return new Promise((resolve, reject) => {
      socket.write(frame, (error) => {
        if (error) reject(new ConnectionError(`TCP write failed: ${error.message}`, { cause: error }));
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    const socket = this.#socket;
    if (!socket) return;
    this.#socket = null;
    if (socket.closed) return;
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.destroy();
    });
  }
}
