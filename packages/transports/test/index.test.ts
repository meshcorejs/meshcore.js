import { describe, expect, it } from 'vitest';
import * as transports from '../src/index.js';
import * as mock from '../src/mock/index.js';

describe('public API', () => {
  it('exports transports, errors and the typed emitter', () => {
    expect(Object.keys(transports).sort()).toEqual(
      [
        'BLE_RX_CHARACTERISTIC_UUID',
        'BLE_SERVICE_UUID',
        'BLE_TX_CHARACTERISTIC_UUID',
        'BleTransport',
        'ConnectionError',
        'MeshcoreError',
        'MissingDependencyError',
        'SerialTransport',
        'TcpTransport',
        'TypedEmitter',
        'importOptional',
      ].sort(),
    );
  });

  it('exports test doubles from the ./mock entry point', () => {
    expect(Object.keys(mock).sort()).toEqual(['FakeRadio', 'MockTransport', 'fakeContactRecord']);
  });
});
