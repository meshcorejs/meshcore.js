import { ConnectionError } from './errors.js';
import { importOptional } from './optional-import.js';
import type { Transport, TransportEvents } from './transport.js';
import { TypedEmitter } from './typed-emitter.js';

export const BLE_SERVICE_UUID = '6e400001b5a3f393e0a9e50e24dcca9e';
export const BLE_RX_CHARACTERISTIC_UUID = '6e400002b5a3f393e0a9e50e24dcca9e';
export const BLE_TX_CHARACTERISTIC_UUID = '6e400003b5a3f393e0a9e50e24dcca9e';

export interface NobleCharacteristicLike {
  uuid: string;
  subscribeAsync(): Promise<void>;
  writeAsync(data: Buffer, withoutResponse: boolean): Promise<void>;
  on(event: 'data', listener: (data: Buffer, isNotification: boolean) => void): unknown;
  removeAllListeners(event?: string): unknown;
}

export interface NoblePeripheralLike {
  address: string;
  advertisement: { localName?: string | undefined };
  connectAsync(): Promise<void>;
  disconnectAsync(): Promise<void>;
  discoverSomeServicesAndCharacteristicsAsync(
    serviceUuids: string[],
    characteristicUuids: string[],
  ): Promise<{ characteristics: NobleCharacteristicLike[] }>;
  once(event: 'disconnect', listener: () => void): unknown;
  removeAllListeners(event?: string): unknown;
}

export interface NobleLike {
  state: string;
  on(event: 'stateChange', listener: (state: string) => void): unknown;
  on(event: 'discover', listener: (peripheral: NoblePeripheralLike) => void): unknown;
  // biome-ignore lint/suspicious/noExplicitAny: mirrors the EventEmitter signature
  removeListener(event: 'stateChange' | 'discover', listener: (...args: any[]) => void): unknown;
  startScanningAsync(serviceUuids: string[], allowDuplicates: boolean): Promise<void>;
  stopScanningAsync(): Promise<void>;
}

export interface BleTransportOptions {
  address?: string;
  name?: string;
  scanTimeoutMs?: number;
}

export interface BleTransportDeps {
  loadNoble?: () => Promise<NobleLike>;
}

interface Connection {
  peripheral: NoblePeripheralLike;
  rx: NobleCharacteristicLike;
  tx: NobleCharacteristicLike;
}

export class BleTransport extends TypedEmitter<TransportEvents> implements Transport {
  readonly kind = 'ble';
  readonly #options: BleTransportOptions;
  readonly #loadNoble: () => Promise<NobleLike>;
  #connection: Connection | null = null;

  /**
   * @param options address or name of the radio, scanTimeoutMs. Default 15000
   * @param deps Test seam replacing the noble import
   */
  constructor(options: BleTransportOptions = {}, deps: BleTransportDeps = {}) {
    super();
    this.#options = options;
    this.#loadNoble =
      deps.loadNoble ?? (async () => (await importOptional<{ default: NobleLike }>('@abandonware/noble')).default);
  }

  get connected(): boolean {
    return this.#connection !== null;
  }

  /** @param signal Aborts the connection attempt */
  async connect(signal?: AbortSignal): Promise<void> {
    if (this.#connection) throw new ConnectionError('BLE transport is already connected');
    signal?.throwIfAborted();
    const noble = await this.#loadNoble();
    const timeoutMs = this.#options.scanTimeoutMs ?? 15_000;

    await this.#waitPoweredOn(noble, timeoutMs, signal);
    const peripheral = await this.#scan(noble, timeoutMs, signal);

    try {
      await peripheral.connectAsync();
      const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [BLE_SERVICE_UUID],
        [BLE_RX_CHARACTERISTIC_UUID, BLE_TX_CHARACTERISTIC_UUID],
      );
      const rx = characteristics.find((c) => c.uuid === BLE_RX_CHARACTERISTIC_UUID);
      const tx = characteristics.find((c) => c.uuid === BLE_TX_CHARACTERISTIC_UUID);
      if (!rx || !tx)
        throw new ConnectionError(`BLE device ${peripheral.address} does not expose the Companion UART service`);
      await tx.subscribeAsync();
      signal?.throwIfAborted();

      const connection: Connection = { peripheral, rx, tx };
      this.#connection = connection;
      tx.on('data', (data) => this.emit('frame', Uint8Array.from(data)));
      peripheral.once('disconnect', () => {
        if (this.#connection !== connection) return;
        this.#connection = null;
        tx.removeAllListeners('data');
        this.emit('close', new ConnectionError(`BLE device ${peripheral.address} disconnected`));
      });
    } catch (error) {
      await peripheral.disconnectAsync().catch(() => undefined);
      if (error instanceof ConnectionError || signal?.aborted) throw error;
      throw new ConnectionError(`BLE connection to ${peripheral.address} failed: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  #waitPoweredOn(noble: NobleLike, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    if (noble.state === 'poweredOn') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        noble.removeListener('stateChange', onState);
        signal?.removeEventListener('abort', onAbort);
      };
      const onState = (state: string) => {
        if (state !== 'poweredOn') return;
        cleanup();
        resolve();
      };
      const onAbort = () => {
        cleanup();
        reject(signal?.reason);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new ConnectionError(`Bluetooth adapter not powered on after ${timeoutMs} ms (state: ${noble.state})`));
      }, timeoutMs);
      noble.on('stateChange', onState);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async #scan(noble: NobleLike, timeoutMs: number, signal?: AbortSignal): Promise<NoblePeripheralLike> {
    const address = this.#options.address?.toLowerCase();
    const name = this.#options.name;
    const matches = (p: NoblePeripheralLike) =>
      (address === undefined || p.address.toLowerCase() === address) &&
      (name === undefined || p.advertisement.localName === name);

    const found = new Promise<NoblePeripheralLike>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        noble.removeListener('discover', onDiscover);
        signal?.removeEventListener('abort', onAbort);
      };
      const onDiscover = (peripheral: NoblePeripheralLike) => {
        if (!matches(peripheral)) return;
        cleanup();
        resolve(peripheral);
      };
      const onAbort = () => {
        cleanup();
        reject(signal?.reason);
      };
      const timer = setTimeout(() => {
        cleanup();
        const target = address ?? name ?? 'any Companion radio';
        reject(new ConnectionError(`no BLE device found for ${target} after ${timeoutMs} ms`));
      }, timeoutMs);
      noble.on('discover', onDiscover);
      signal?.addEventListener('abort', onAbort, { once: true });
    });

    await noble.startScanningAsync([BLE_SERVICE_UUID], false);
    try {
      return await found;
    } finally {
      await noble.stopScanningAsync();
    }
  }

  /** @param payload Frame payload without framing */
  async write(payload: Uint8Array): Promise<void> {
    const connection = this.#connection;
    if (!connection) throw new ConnectionError('BLE transport is not connected');
    try {
      await connection.rx.writeAsync(Buffer.from(payload), false);
    } catch (error) {
      throw new ConnectionError(`BLE write failed: ${(error as Error).message}`, { cause: error });
    }
  }

  async close(): Promise<void> {
    const connection = this.#connection;
    if (!connection) return;
    this.#connection = null;
    connection.tx.removeAllListeners('data');
    connection.peripheral.removeAllListeners('disconnect');
    await connection.peripheral.disconnectAsync().catch(() => undefined);
  }
}
