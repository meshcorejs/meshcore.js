import { EventEmitter } from 'node:events';
import { toHex } from '@meshcorejs/protocol';
import { describe, expect, it, vi } from 'vitest';
import {
  BLE_RX_CHARACTERISTIC_UUID,
  BLE_SERVICE_UUID,
  BLE_TX_CHARACTERISTIC_UUID,
  BleTransport,
  type NobleCharacteristicLike,
  type NobleLike,
  type NoblePeripheralLike,
} from '../src/ble.js';
import { ConnectionError } from '../src/errors.js';

class FakeCharacteristic extends EventEmitter implements NobleCharacteristicLike {
  readonly writes: Array<{ data: Buffer; withoutResponse: boolean }> = [];
  subscribed = false;

  constructor(readonly uuid: string) {
    super();
  }

  async subscribeAsync(): Promise<void> {
    this.subscribed = true;
  }

  async writeAsync(data: Buffer, withoutResponse: boolean): Promise<void> {
    this.writes.push({ data, withoutResponse });
  }
}

class FakePeripheral extends EventEmitter implements NoblePeripheralLike {
  readonly rx = new FakeCharacteristic(BLE_RX_CHARACTERISTIC_UUID);
  readonly tx = new FakeCharacteristic(BLE_TX_CHARACTERISTIC_UUID);
  connectedState = false;
  discoveredWith: [string[], string[]] | null = null;

  constructor(
    readonly address: string,
    readonly advertisement: { localName?: string },
  ) {
    super();
  }

  async connectAsync(): Promise<void> {
    this.connectedState = true;
  }

  async disconnectAsync(): Promise<void> {
    this.connectedState = false;
  }

  async discoverSomeServicesAndCharacteristicsAsync(services: string[], characteristics: string[]) {
    this.discoveredWith = [services, characteristics];
    return { characteristics: [this.rx, this.tx] };
  }
}

class FakeNoble extends EventEmitter implements NobleLike {
  state = 'poweredOn';
  scanning = false;
  scanServices: string[] = [];

  constructor(private readonly nearby: FakePeripheral[]) {
    super();
  }

  async startScanningAsync(services: string[]): Promise<void> {
    this.scanning = true;
    this.scanServices = services;
    queueMicrotask(() => {
      for (const peripheral of this.nearby) this.emit('discover', peripheral);
    });
  }

  async stopScanningAsync(): Promise<void> {
    this.scanning = false;
  }
}

function setup(options: ConstructorParameters<typeof BleTransport>[0] = {}) {
  const other = new FakePeripheral('aa:aa:aa:aa:aa:aa', { localName: 'Other' });
  const target = new FakePeripheral('C8:2B:96:00:11:22', { localName: 'MeshCore-TrainBot' });
  const noble = new FakeNoble([other, target]);
  const transport = new BleTransport(options, { loadNoble: async () => noble });
  return { noble, other, target, transport };
}

describe('BleTransport', () => {
  it('scans for the Companion service and connects to the device matching the address', async () => {
    const { noble, target, transport } = setup({ address: 'c8:2b:96:00:11:22' });
    await transport.connect();
    expect(noble.scanServices).toEqual([BLE_SERVICE_UUID]);
    expect(noble.scanning).toBe(false);
    expect(target.connectedState).toBe(true);
    expect(target.discoveredWith).toEqual([
      [BLE_SERVICE_UUID],
      [BLE_RX_CHARACTERISTIC_UUID, BLE_TX_CHARACTERISTIC_UUID],
    ]);
    expect(target.tx.subscribed).toBe(true);
    expect(transport.connected).toBe(true);
  });

  it('can match on the advertised name', async () => {
    const { target, transport } = setup({ name: 'MeshCore-TrainBot' });
    await transport.connect();
    expect(target.connectedState).toBe(true);
  });

  it('writes bare payloads with response and emits notifications as frames', async () => {
    const { target, transport } = setup({ name: 'MeshCore-TrainBot' });
    await transport.connect();
    const frames: string[] = [];
    transport.on('frame', (payload) => frames.push(toHex(payload)));

    await transport.write(Uint8Array.of(0x16, 0x03));
    expect(target.rx.writes).toEqual([{ data: Buffer.from([0x16, 0x03]), withoutResponse: false }]);

    target.tx.emit('data', Buffer.from([0x00]), true);
    expect(frames).toEqual(['00']);
  });

  it('waits for the adapter to power on', async () => {
    const { noble, transport } = setup({ name: 'MeshCore-TrainBot' });
    noble.state = 'unknown';
    const connecting = transport.connect();
    await new Promise((resolve) => setTimeout(resolve, 5));
    noble.state = 'poweredOn';
    noble.emit('stateChange', 'poweredOn');
    await connecting;
    expect(transport.connected).toBe(true);
  });

  it('fails with ConnectionError when no device matches before the timeout', async () => {
    const { transport } = setup({ address: '00:00:00:00:00:00', scanTimeoutMs: 20 });
    await expect(transport.connect()).rejects.toThrow('no BLE device found for 00:00:00:00:00:00 after 20 ms');
  });

  it('emits close when the device disconnects, but not on local close()', async () => {
    const first = setup({ name: 'MeshCore-TrainBot' });
    await first.transport.connect();
    const onClose = vi.fn();
    first.transport.on('close', onClose);
    first.target.emit('disconnect');
    expect(onClose).toHaveBeenCalledWith(expect.any(ConnectionError));

    const second = setup({ name: 'MeshCore-TrainBot' });
    await second.transport.connect();
    const onSecondClose = vi.fn();
    second.transport.on('close', onSecondClose);
    await second.transport.close();
    expect(second.target.connectedState).toBe(false);
    expect(onSecondClose).not.toHaveBeenCalled();
  });

  it('rejects writes when not connected', async () => {
    const { transport } = setup();
    await expect(transport.write(Uint8Array.of(1))).rejects.toBeInstanceOf(ConnectionError);
  });
});
