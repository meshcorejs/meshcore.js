# @meshcorejs/transports — agent guide

## Purpose

Moves frame payloads between the app and a Companion radio behind one `Transport` interface: `TcpTransport`
(WiFi), `SerialTransport` (USB), `BleTransport`. The `@meshcorejs/transports/mock` subpath ships
`MockTransport` (in-memory) and `FakeRadio` (a firmware emulator) used by every test in the monorepo.

- Depends on: `@meshcorejs/protocol` (framing, response encoders for `FakeRadio`). Optional peers, never
  installed by the repo: `serialport` (≥ 12), `@abandonware/noble`.
- Used by: `@meshcorejs/client` (re-exports the three transports and `Transport`), `@meshcorejs/testing` (re-exports
  `/mock`).

## Layout

```
src/
  index.ts              main subpath: transports, Transport types, TypedEmitter, errors, importOptional
  transport.ts          Transport interface, TransportEvents { frame, close }, TransportKind
  typed-emitter.ts      TypedEmitter<EventMap>: typed on/once/off/emit (also used by the @meshcorejs/client Client)
  tcp.ts                TcpTransport({ host, port = 5000 }) — node:net, setNoDelay
  serial.ts             SerialTransport({ path, baudRate = 115200 }, { loadModule? })
  ble.ts                BleTransport({ address?, name?, scanTimeoutMs = 15000 }, { loadNoble? }) + NUS UUIDs
  optional-import.ts    importOptional(name): dynamic import → MissingDependencyError when absent
  errors.ts             MeshcoreError { code }, ConnectionError, MissingDependencyError (base classes reused by @meshcorejs/client)
  mock/
    index.ts            "./mock" subpath
    mock-transport.ts   MockTransport: written[], receive(), setRadio(), failNextConnect(), simulateDisconnect()
    fake-radio.ts       FakeRadio: emulates FIRMWARE_VER_CODE 13 for the v1 command subset
test/                   one file per module; serial/ble tests inject fakes through the deps argument
```

## Public API

```ts
interface Transport extends TypedEmitter<{ frame: [Uint8Array]; close: [Error?] }> {
  readonly kind: 'serial' | 'tcp' | 'ble' | 'mock';
  readonly connected: boolean;
  connect(signal?: AbortSignal): Promise<void>;
  write(payload: Uint8Array): Promise<void>; // payload without framing header
  close(): Promise<void>;
}
```

- `TcpTransport`, `SerialTransport`, `BleTransport` and their `*Options` / `*Deps` types;
  `BLE_SERVICE_UUID`, `BLE_RX_CHARACTERISTIC_UUID`, `BLE_TX_CHARACTERISTIC_UUID` (Nordic UART).
- `TypedEmitter`, `EventMap`, `Listener`; `MeshcoreError`, `ConnectionError`, `MissingDependencyError`;
  `importOptional`.
- `/mock`: `MockTransport`, `RadioHandler`, `FakeRadio`, `FakeRadioOptions` (`self`, `device`, `contacts`,
  `channels`, `clock`, `suggestedTimeoutMs`, `selfAdvertPacket`), `AckMode = 'auto' | 'manual' | 'never'`,
  `FakeSentMessage` (`kind: 'dm' | 'channel'`), `fakeContactRecord(partial)`.
- `FakeRadio` runtime knobs: `attach(transport)`, `sent[]`, `commands[]`, `ackMode`, `ackDelayMs`,
  `unresponsive`, `refuseSelfAdvert` (when true, `SEND_SELF_ADVERT` answers `Err BadState` instead of `Ok` —
  for testing a firmware refusal, as opposed to `unresponsive`'s timeout), `batteryMillivolts`,
  `receiveContactMessage()`, `receiveChannelMessage()`, `hearAdvert()`, `updatePath()`, `deleteContact()`,
  `ack(expectedAck, roundTripMs)`.

## Rules

- A transport **only moves payloads**: it adds/strips the framing (serial/TCP: `'<'`/`'>' | len u16 LE`; BLE:
  one write/notification = one frame, no header) and emits `frame` per decoded payload. No reconnection, no
  protocol knowledge, no queueing: the `Client` in `@meshcorejs/client` owns that.
- `close` is emitted for **unexpected** losses only, never after the app called `close()`.
- `serialport` and `@abandonware/noble` are loaded lazily through `importOptional` inside `connect()`. Importing
  the package must never fail when they are absent; connecting must throw `MissingDependencyError` naming
  the module to install. Keep them in `peerDependencies` + `peerDependenciesMeta.optional`.
- The second constructor argument (`loadModule` / `loadNoble`) is a test seam: use it in tests instead of
  mocking module resolution.
- BLE pairing (PIN) is left to the OS; noble has no pairing API.
- `FakeRadio` must stay faithful to the firmware it emulates (channel messages are prefixed `"<name>: "` and
  silently truncated at 160 bytes, DM ACKs follow `SENT.expected_ack`, responses arrive on a later microtask).
  It also applies `SET_ADVERT_NAME`, `SET_ADVERT_LATLON`, `SET_RADIO_TX_POWER` (refused above `self.maxTxPowerDbm`,
  settable through `FakeRadioOptions.self`) and `SET_RADIO_PARAMS` (the optional repeat byte updates `device.repeatEnabled`)
  to `self`/`device`, answering `OK` or `ERR IllegalArg` like the firmware.
  When adding a command to `protocol`, teach `FakeRadio` to answer it.

## Testing

- `pnpm vitest run packages/transports`.
- TCP is tested against a real `node:net` server on a random port; serial and BLE against hand-written fakes
  (`SerialPortLike`, `NobleLike`) injected through `*Deps`. No native module is ever loaded in tests.
- Real hardware: not verified yet for serial and BLE (root `AGENTS.md` → Known gaps).

## References

- Root `AGENTS.md` (repo conventions), `packages/protocol/AGENTS.md` (framing and encoders),
  `packages/client/AGENTS.md` (the `Client` owns reconnection).
