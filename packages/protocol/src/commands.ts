import { ByteWriter, utf8ByteLength } from './bytes.js';
import { APP_TARGET_VERSION, CommandCode, MAX_TEXT_LEN, NAME_FIELD_SIZE, TxtType } from './constants.js';
import { assertU8, assertU32, writeChannelRecord, writeContactRecord } from './encode/records.js';
import { publicKeyPrefixToBytes, publicKeyToBytes } from './keys.js';
import type { ContactRecord } from './types.js';

function assertText(text: string): void {
  const length = utf8ByteLength(text);
  if (length > MAX_TEXT_LEN) {
    throw new RangeError(`text is ${length} bytes, maximum is ${MAX_TEXT_LEN}`);
  }
}

/**
 * `APP_START`: identify the app to the radio; the radio answers with `SelfInfo`.
 * @param appName Name announced to the radio
 */
export function encodeAppStart(appName: string): Uint8Array {
  return new ByteWriter().u8(CommandCode.AppStart).zeros(7).string(appName).toBytes();
}

/**
 * `DEVICE_QUERY`: ask the radio for its `DeviceInfo`, announcing the protocol version the app supports.
 * @param appTargetVersion Protocol version the app supports. Default 3
 */
export function encodeDeviceQuery(appTargetVersion: number = APP_TARGET_VERSION): Uint8Array {
  assertU8('appTargetVersion', appTargetVersion);
  return new ByteWriter().u8(CommandCode.DeviceQuery).u8(appTargetVersion).toBytes();
}

/** Parameters for {@link encodeSendTxtMsg}. */
export interface SendTxtMsgParams {
  recipient: string;
  text: string;
  timestamp: number;
  attempt?: number;
  txtType?: number;
}

/**
 * `SEND_TXT_MSG`: send a direct message to a contact; the radio answers `Sent` with the ack to wait for.
 * @param params recipient, text, timestamp, attempt and txtType
 */
export function encodeSendTxtMsg(params: SendTxtMsgParams): Uint8Array {
  const attempt = params.attempt ?? 0;
  assertU8('attempt', attempt);
  assertU32('timestamp', params.timestamp);
  assertText(params.text);
  return new ByteWriter()
    .u8(CommandCode.SendTxtMsg)
    .u8(params.txtType ?? TxtType.Plain)
    .u8(attempt)
    .u32(params.timestamp)
    .bytes(publicKeyPrefixToBytes(params.recipient))
    .string(params.text)
    .toBytes();
}

/** Parameters for {@link encodeSendChannelTxtMsg}. */
export interface SendChannelTxtMsgParams {
  channelIndex: number;
  text: string;
  timestamp: number;
}

/**
 * `SEND_CHANNEL_TXT_MSG`: post a message on a channel; the radio answers `Ok`.
 * @param params channelIndex, text and timestamp
 */
export function encodeSendChannelTxtMsg(params: SendChannelTxtMsgParams): Uint8Array {
  assertU8('channelIndex', params.channelIndex);
  assertU32('timestamp', params.timestamp);
  assertText(params.text);
  return new ByteWriter()
    .u8(CommandCode.SendChannelTxtMsg)
    .u8(TxtType.Plain)
    .u8(params.channelIndex)
    .u32(params.timestamp)
    .string(params.text)
    .toBytes();
}

/**
 * `GET_CONTACTS`: list the contact table, optionally only those modified since a timestamp; answered by `ContactsStart`, `Contact`… `EndOfContacts`.
 * @param since Only contacts modified after this epoch
 */
export function encodeGetContacts(since?: number): Uint8Array {
  const writer = new ByteWriter().u8(CommandCode.GetContacts);
  if (since !== undefined) {
    assertU32('since', since);
    writer.u32(since);
  }
  return writer.toBytes();
}

/** `GET_DEVICE_TIME`: read the radio's clock; answered by `CurrTime`. */
export function encodeGetDeviceTime(): Uint8Array {
  return Uint8Array.of(CommandCode.GetDeviceTime);
}

/**
 * `SET_DEVICE_TIME`: set the radio's clock, in seconds since the Unix epoch.
 * @param epochSeconds Current time in seconds
 */
export function encodeSetDeviceTime(epochSeconds: number): Uint8Array {
  assertU32('epochSeconds', epochSeconds);
  return new ByteWriter().u8(CommandCode.SetDeviceTime).u32(epochSeconds).toBytes();
}

/**
 * `SEND_SELF_ADVERT`: advertise this node to the mesh, direct or flood.
 * @param options flood or zero-hop
 */
export function encodeSendSelfAdvert(options: { flood: boolean }): Uint8Array {
  return Uint8Array.of(CommandCode.SendSelfAdvert, options.flood ? 1 : 0);
}

/**
 * `ADD_UPDATE_CONTACT`: create or overwrite a contact of the radio's table.
 * @param contact Contact record
 */
export function encodeAddUpdateContact(contact: ContactRecord): Uint8Array {
  return writeContactRecord(new ByteWriter().u8(CommandCode.AddUpdateContact), contact).toBytes();
}

/** `SYNC_NEXT_MESSAGE`: pop the next received message; answered by `ContactMsgRecv`, `ChannelMsgRecv` or `NoMoreMessages`. */
export function encodeSyncNextMessage(): Uint8Array {
  return Uint8Array.of(CommandCode.SyncNextMessage);
}

/**
 * `RESET_PATH`: forget the route to a contact so the next message floods.
 * @param publicKey 64 hex characters
 */
export function encodeResetPath(publicKey: string): Uint8Array {
  return new ByteWriter().u8(CommandCode.ResetPath).bytes(publicKeyToBytes(publicKey)).toBytes();
}

/**
 * `REMOVE_CONTACT`: delete a contact from the radio's table.
 * @param publicKey 64 hex characters
 */
export function encodeRemoveContact(publicKey: string): Uint8Array {
  return new ByteWriter().u8(CommandCode.RemoveContact).bytes(publicKeyToBytes(publicKey)).toBytes();
}

/**
 * `EXPORT_CONTACT`: get the advert packet of a contact, or of this node when no key is given; answered by `ExportContact`.
 * @param publicKey Contact to export, this node when omitted
 */
export function encodeExportContact(publicKey?: string): Uint8Array {
  const writer = new ByteWriter().u8(CommandCode.ExportContact);
  if (publicKey !== undefined) writer.bytes(publicKeyToBytes(publicKey));
  return writer.toBytes();
}

/** `GET_BATT_AND_STORAGE`: read the battery voltage and storage usage; answered by `BattAndStorage`. */
export function encodeGetBattAndStorage(): Uint8Array {
  return Uint8Array.of(CommandCode.GetBattAndStorage);
}

/**
 * `GET_CONTACT_BY_KEY`: read one contact; answered by `Contact` or `Err`.
 * @param publicKey 64 hex characters
 */
export function encodeGetContactByKey(publicKey: string): Uint8Array {
  return new ByteWriter().u8(CommandCode.GetContactByKey).bytes(publicKeyToBytes(publicKey)).toBytes();
}

/**
 * `GET_CHANNEL`: read a channel slot; answered by `ChannelInfo`.
 * @param index Channel slot
 */
export function encodeGetChannel(index: number): Uint8Array {
  assertU8('index', index);
  return Uint8Array.of(CommandCode.GetChannel, index);
}

/** Parameters for {@link encodeSetChannel}. */
export interface SetChannelParams {
  index: number;
  name: string;
  secret: Uint8Array;
}

/**
 * `SET_CHANNEL`: write a channel slot (name and 16-byte secret).
 * @param params Slot, name and secret
 */
export function encodeSetChannel(params: SetChannelParams): Uint8Array {
  return writeChannelRecord(new ByteWriter().u8(CommandCode.SetChannel), params).toBytes();
}

const MAX_NODE_NAME_BYTES = NAME_FIELD_SIZE - 1;

function assertRange(name: string, value: number, min: number, max: number, integer: boolean): void {
  const ok = Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
  if (!ok) {
    throw new RangeError(`${name} must be ${integer ? 'an integer ' : ''}between ${min} and ${max}, got ${value}`);
  }
}

/**
 * `SET_ADVERT_NAME`: rename this node (at most 31 UTF-8 bytes).
 * @param name 1 to 31 UTF-8 bytes
 */
export function encodeSetAdvertName(name: string): Uint8Array {
  const length = utf8ByteLength(name);
  if (length === 0 || length > MAX_NODE_NAME_BYTES) {
    throw new RangeError(`name must be 1 to ${MAX_NODE_NAME_BYTES} UTF-8 bytes, got ${length}`);
  }
  return new ByteWriter().u8(CommandCode.SetAdvertName).string(name).toBytes();
}

/** Parameters for {@link encodeSetAdvertLatLon}: latitude and longitude in decimal degrees. */
export interface SetAdvertLatLonCommand {
  latitude: number;
  longitude: number;
}

/**
 * `SET_ADVERT_LATLON`: set the location this node advertises.
 * @param params latitude and longitude in decimal degrees
 */
export function encodeSetAdvertLatLon(params: SetAdvertLatLonCommand): Uint8Array {
  assertRange('latitude', params.latitude, -90, 90, false);
  assertRange('longitude', params.longitude, -180, 180, false);
  return new ByteWriter()
    .u8(CommandCode.SetAdvertLatLon)
    .i32(Math.round(params.latitude * 1_000_000))
    .i32(Math.round(params.longitude * 1_000_000))
    .toBytes();
}

/**
 * `SET_RADIO_TX_POWER`: set the transmit power in dBm.
 * @param dbm Transmit power
 */
export function encodeSetRadioTxPower(dbm: number): Uint8Array {
  assertRange('dbm', dbm, -128, 127, true);
  return Uint8Array.of(CommandCode.SetRadioTxPower, dbm & 0xff);
}

/** Parameters for {@link encodeSetRadioParams}; `repeat` is written to the wire only when defined. */
export interface SetRadioParamsCommand {
  frequencyKhz: number;
  bandwidthHz: number;
  spreadingFactor: number;
  codingRate: number;
  repeat?: boolean;
}

/**
 * `SET_RADIO_PARAMS`: set frequency, bandwidth, spreading factor and coding rate.
 * @param params frequencyKhz, bandwidthHz, spreadingFactor, codingRate and optional repeat
 */
export function encodeSetRadioParams(params: SetRadioParamsCommand): Uint8Array {
  assertRange('frequencyKhz', params.frequencyKhz, 150_000, 2_500_000, true);
  assertRange('bandwidthHz', params.bandwidthHz, 7_000, 500_000, true);
  assertRange('spreadingFactor', params.spreadingFactor, 5, 12, true);
  assertRange('codingRate', params.codingRate, 5, 8, true);
  const writer = new ByteWriter()
    .u8(CommandCode.SetRadioParams)
    .u32(params.frequencyKhz)
    .u32(params.bandwidthHz)
    .u8(params.spreadingFactor)
    .u8(params.codingRate);
  if (params.repeat !== undefined) writer.u8(params.repeat ? 1 : 0);
  return writer.toBytes();
}
