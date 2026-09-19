# @meshcorejs/protocol — agent guide

## Purpose

Pure codec for the MeshCore **Companion Radio** protocol: serial/TCP framing, encoders for the app → radio
commands, decoders for the radio → app responses and pushes, and encoders for those same responses (used by
`FakeRadio` to emulate a firmware). No I/O, no runtime dependency.

- Depends on: nothing.
- Used by: `@meshcorejs/transports` (framing, response encoders), `@meshcorejs/client` (command encoders,
  `decodeFrame`, records), `@meshcorejs/testing` (types).
- Byte layouts come from `examples/companion_radio/MyMesh.cpp` in `meshcore-dev/MeshCore@0679dbe`
  (`FIRMWARE_VER_CODE 13`).

## Layout

```
src/
  index.ts              public surface (re-exports below)
  bytes.ts              ByteReader / ByteWriter (little-endian), toHex / fromHex, utf8ByteLength
  constants.ts          CommandCode, ResponseCode, PushCode, RadioErrorCode, ContactType, TxtType, sizes
  types.ts              ContactRecord, SelfInfo, DeviceInfo, ChannelRecord and every *Frame / *Push type
  framing.ts            encodeFrame, FrameDecoder (stateful), TO_RADIO_MARKER '<' / FROM_RADIO_MARKER '>'
  commands.ts           encode<Command>(params): Uint8Array — app → radio
  responses.ts          encode<Response>Response / encode<Push>Push — radio → app (for fake radios)
  decode/decode-frame.ts  decodeFrame(bytes): DecodedFrame, table-driven by code
  decode/records.ts     shared record decoders (contact, self info, device info, channel)
  encode/records.ts     shared record encoders (mirror of decode/records.ts)
  keys.ts               isPublicKeyHex, publicKeyToBytes, publicKeyPrefixToBytes
  path.ts               encodePath / decodePath / decodePathLength (null = flood, 0xff = unknown)
  contact-uri.ts        contactUri / parseContactUri (meshcore:// contact card links)
test/
  fixtures.ts           hex frames built byte-by-byte from the firmware layouts, independent of the encoder
  *.test.ts             one file per module
```

## Public API

- **Framing**: `encodeFrame(payload, direction)`, `FrameDecoder` (`push(chunk)` → decoded payloads; accepts
  arbitrary chunking, several frames per chunk, resyncs on garbage, drops empty frames, rejects
  `len > MAX_FRAME_SIZE`).
- **Commands** (app → radio): `encodeAppStart`, `encodeDeviceQuery`, `encodeSendTxtMsg`,
  `encodeSendChannelTxtMsg`, `encodeGetContacts`, `encodeGetDeviceTime`, `encodeSetDeviceTime`,
  `encodeSendSelfAdvert`, `encodeAddUpdateContact`, `encodeSyncNextMessage`, `encodeResetPath`,
  `encodeRemoveContact`, `encodeExportContact`, `encodeGetBattAndStorage`, `encodeGetContactByKey`,
  `encodeGetChannel`, `encodeSetChannel`, `encodeSetAdvertName`, `encodeSetAdvertLatLon`,
  `encodeSetRadioTxPower`, `encodeSetRadioParams`.
- **Decoding**: `decodeFrame(bytes): DecodedFrame` — discriminated union on `type`, with
  `kind: 'response' | 'push'` (codes `0x00–0x7F` are responses, `0x80+` pushes). Unknown code →
  `{ type: 'unknown', code, bytes }`; short/invalid frame → `{ type: 'malformed', code, bytes, reason }`.
- **Responses/pushes** (radio → app, for emulators): `encode<Name>Response` for every decoded response and
  `encode<Name>Push` for every push.
- **Constants**: `CommandCode`, `ResponseCode`, `PushCode`, `RadioErrorCode`, `ContactType`, `TxtType`,
  `MAX_FRAME_SIZE = 176`, `MAX_TEXT_LEN = 160`, `PUB_KEY_SIZE = 32`, `PUB_KEY_PREFIX_SIZE = 6`,
  `MAX_PATH_SIZE = 64`, `NAME_FIELD_SIZE = 32`, `CHANNEL_SECRET_SIZE = 16`, `OUT_PATH_UNKNOWN = 0xff`,
  `APP_TARGET_VERSION = 3`, `MIN_FIRMWARE_VERSION = 3`.
- **Helpers**: `ByteReader`, `ByteWriter`, `toHex`, `fromHex`, `utf8ByteLength`, key/path/contact-URI
  helpers listed in Layout.

## Rules

- **No I/O and no dependencies.** Only `Uint8Array` in, `Uint8Array` or plain objects out.
- `decodeFrame` **never throws**: unknown → `unknown`, invalid → `malformed`. Encoders may throw on invalid
  params (e.g. bad key length).
- Settings commands (`SET_*`) validate the firmware ranges and throw `RangeError`; `repeat` in `SET_RADIO_PARAMS` is written only when defined.
- Framing direction: app → radio `'<'`, radio → app `'>'`. The online Companion documentation has this
  reversed; the firmware (`ArduinoSerialInterface.cpp`, `SerialWifiInterface.cpp`) is the reference.
- Versioned decoding: fields added by newer firmwares (`v3+`, `v7+`, …) are optional in the types and absent
  when the frame is short. Never make an old-firmware frame `malformed` because a new field is missing.
- Integers are little-endian; names are fixed `NAME_FIELD_SIZE` zero-padded UTF-8 fields.
- Adding a command/response: constant in `constants.ts`, type in `types.ts`, encoder in `commands.ts` or
  `responses.ts`, decoder entry in `decode/decode-frame.ts`, a fixture built **from the firmware layout, not
  from the encoder**, tests for encode + decode + round trip, export from `index.ts`.

## Testing

- `pnpm vitest run packages/protocol` — no fake timers needed, everything is synchronous.
- Fixtures in `test/fixtures.ts` are hex strings derived by hand from `MyMesh.cpp`; a decoder test compares
  against them, an encoder test must reproduce them. Replace or complement with real captures when hardware
  fixtures exist (`MESH_CAPTURE=1`, see root `AGENTS.md` → Known gaps).
- `framing.test.ts` covers fragmentation, concatenation, garbage bytes, zero and oversized lengths.

## References

- Firmware: `examples/companion_radio/MyMesh.cpp` in `meshcore-dev/MeshCore@0679dbe`, the source of every byte layout.
- Root `AGENTS.md` (repo conventions), `packages/transports/AGENTS.md` (`FakeRadio` uses the response encoders).
