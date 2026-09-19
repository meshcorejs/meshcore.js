export {
  BLE_RX_CHARACTERISTIC_UUID,
  BLE_SERVICE_UUID,
  BLE_TX_CHARACTERISTIC_UUID,
  BleTransport,
  type BleTransportDeps,
  type BleTransportOptions,
  type NobleCharacteristicLike,
  type NobleLike,
  type NoblePeripheralLike,
} from './ble.js';
export { ConnectionError, MeshcoreError, MissingDependencyError } from './errors.js';
export { importOptional } from './optional-import.js';
export {
  type SerialPortLike,
  type SerialPortModule,
  SerialTransport,
  type SerialTransportDeps,
  type SerialTransportOptions,
} from './serial.js';
export { TcpTransport, type TcpTransportOptions } from './tcp.js';
export type { Transport, TransportEvents, TransportKind } from './transport.js';
export { type EventMap, type Listener, TypedEmitter } from './typed-emitter.js';
