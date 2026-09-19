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

/** @param appName Name announced to the radio */
export function encodeAppStart(appName: string): Uint8Array {
  return new ByteWriter().u8(CommandCode.AppStart).zeros(7).string(appName).toBytes();
}

/** @param appTargetVersion Protocol version the app supports. Default 3 */
export function encodeDeviceQuery(appTargetVersion: number = APP_TARGET_VERSION): Uint8Array {
  assertU8('appTargetVersion', appTargetVersion);
  return new ByteWriter().u8(CommandCode.DeviceQuery).u8(appTargetVersion).toBytes();
}

export interface SendTxtMsgParams {
  recipient: string;
  text: string;
  timestamp: number;
  attempt?: number;
  txtType?: number;
}

/** @param params recipient, text, timestamp, attempt and txtType */
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

export interface SendChannelTxtMsgParams {
  channelIndex: number;
  text: string;
  timestamp: number;
}

/** @param params channelIndex, text and timestamp */
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

/** @param since Only contacts modified after this epoch */
export function encodeGetContacts(since?: number): Uint8Array {
  const writer = new ByteWriter().u8(CommandCode.GetContacts);
  if (since !== undefined) {
    assertU32('since', since);
    writer.u32(since);
  }
  return writer.toBytes();
}

export function encodeGetDeviceTime(): Uint8Array {
  return Uint8Array.of(CommandCode.GetDeviceTime);
}

/** @param epochSeconds Current time in seconds */
export function encodeSetDeviceTime(epochSeconds: number): Uint8Array {
  assertU32('epochSeconds', epochSeconds);
  return new ByteWriter().u8(CommandCode.SetDeviceTime).u32(epochSeconds).toBytes();
}

/** @param options flood or zero-hop */
export function encodeSendSelfAdvert(options: { flood: boolean }): Uint8Array {
  return Uint8Array.of(CommandCode.SendSelfAdvert, options.flood ? 1 : 0);
}

/** @param contact Contact record */
export function encodeAddUpdateContact(contact: ContactRecord): Uint8Array {
  return writeContactRecord(new ByteWriter().u8(CommandCode.AddUpdateContact), contact).toBytes();
}

export function encodeSyncNextMessage(): Uint8Array {
  return Uint8Array.of(CommandCode.SyncNextMessage);
}

/** @param publicKey 64 hex characters */
export function encodeResetPath(publicKey: string): Uint8Array {
  return new ByteWriter().u8(CommandCode.ResetPath).bytes(publicKeyToBytes(publicKey)).toBytes();
}

/** @param publicKey 64 hex characters */
export function encodeRemoveContact(publicKey: string): Uint8Array {
  return new ByteWriter().u8(CommandCode.RemoveContact).bytes(publicKeyToBytes(publicKey)).toBytes();
}

/** @param publicKey Contact to export, this node when omitted */
export function encodeExportContact(publicKey?: string): Uint8Array {
  const writer = new ByteWriter().u8(CommandCode.ExportContact);
  if (publicKey !== undefined) writer.bytes(publicKeyToBytes(publicKey));
  return writer.toBytes();
}

export function encodeGetBattAndStorage(): Uint8Array {
  return Uint8Array.of(CommandCode.GetBattAndStorage);
}

/** @param publicKey 64 hex characters */
export function encodeGetContactByKey(publicKey: string): Uint8Array {
  return new ByteWriter().u8(CommandCode.GetContactByKey).bytes(publicKeyToBytes(publicKey)).toBytes();
}

/** @param index Channel slot */
export function encodeGetChannel(index: number): Uint8Array {
  assertU8('index', index);
  return Uint8Array.of(CommandCode.GetChannel, index);
}

export interface SetChannelParams {
  index: number;
  name: string;
  secret: Uint8Array;
}

/** @param params Slot, name and secret */
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

/** @param name 1 to 31 UTF-8 bytes */
export function encodeSetAdvertName(name: string): Uint8Array {
  const length = utf8ByteLength(name);
  if (length === 0 || length > MAX_NODE_NAME_BYTES) {
    throw new RangeError(`name must be 1 to ${MAX_NODE_NAME_BYTES} UTF-8 bytes, got ${length}`);
  }
  return new ByteWriter().u8(CommandCode.SetAdvertName).string(name).toBytes();
}

export interface SetAdvertLatLonCommand {
  latitude: number;
  longitude: number;
}

/** @param params latitude and longitude in decimal degrees */
export function encodeSetAdvertLatLon(params: SetAdvertLatLonCommand): Uint8Array {
  assertRange('latitude', params.latitude, -90, 90, false);
  assertRange('longitude', params.longitude, -180, 180, false);
  return new ByteWriter()
    .u8(CommandCode.SetAdvertLatLon)
    .i32(Math.round(params.latitude * 1_000_000))
    .i32(Math.round(params.longitude * 1_000_000))
    .toBytes();
}

/** @param dbm Transmit power */
export function encodeSetRadioTxPower(dbm: number): Uint8Array {
  assertRange('dbm', dbm, -128, 127, true);
  return Uint8Array.of(CommandCode.SetRadioTxPower, dbm & 0xff);
}

export interface SetRadioParamsCommand {
  frequencyKhz: number;
  bandwidthHz: number;
  spreadingFactor: number;
  codingRate: number;
  repeat?: boolean;
}

/** @param params frequencyKhz, bandwidthHz, spreadingFactor, codingRate and optional repeat */
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
