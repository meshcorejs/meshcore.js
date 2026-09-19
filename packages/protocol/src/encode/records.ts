import type { ByteWriter } from '../bytes.js';
import { CHANNEL_SECRET_SIZE, NAME_FIELD_SIZE } from '../constants.js';
import { publicKeyToBytes } from '../keys.js';
import { encodePath } from '../path.js';
import type { ChannelRecord, ContactRecord, DeviceInfo, SelfInfo } from '../types.js';

const toMicroDegrees = (degrees: number): number => Math.round(degrees * 1_000_000);

export function assertU8(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${name} must be an unsigned 8-bit integer, got ${value}`);
  }
}

export function assertU16(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`${name} must be an unsigned 16-bit integer, got ${value}`);
  }
}

export function assertU32(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer, got ${value}`);
  }
}

export function writeContactRecord(writer: ByteWriter, contact: ContactRecord): ByteWriter {
  assertU8('type', contact.type);
  assertU8('flags', contact.flags);
  assertU32('lastAdvertTimestamp', contact.lastAdvertTimestamp);
  assertU32('lastModified', contact.lastModified);
  const path = encodePath(contact.outPath);
  return writer
    .bytes(publicKeyToBytes(contact.publicKey))
    .u8(contact.type)
    .u8(contact.flags)
    .u8(path.pathLen)
    .bytes(path.bytes)
    .fixedString(contact.name, NAME_FIELD_SIZE)
    .u32(contact.lastAdvertTimestamp)
    .i32(toMicroDegrees(contact.latitude))
    .i32(toMicroDegrees(contact.longitude))
    .u32(contact.lastModified);
}

export function writeSelfInfo(writer: ByteWriter, info: SelfInfo): ByteWriter {
  const telemetry =
    (info.telemetryModes.environment << 4) | (info.telemetryModes.location << 2) | info.telemetryModes.base;
  return writer
    .u8(info.advertType)
    .u8(info.txPowerDbm)
    .u8(info.maxTxPowerDbm)
    .bytes(publicKeyToBytes(info.publicKey))
    .i32(toMicroDegrees(info.latitude))
    .i32(toMicroDegrees(info.longitude))
    .u8(info.multiAcks)
    .u8(info.advertLocationPolicy)
    .u8(telemetry)
    .u8(info.manualAddContacts ? 1 : 0)
    .u32(info.radio.frequencyKhz)
    .u32(info.radio.bandwidthHz)
    .u8(info.radio.spreadingFactor)
    .u8(info.radio.codingRate)
    .string(info.name);
}

export function writeDeviceInfo(writer: ByteWriter, info: DeviceInfo): ByteWriter {
  writer.u8(info.firmwareVersion);
  if (
    info.maxContacts === null ||
    info.maxChannels === null ||
    info.blePin === null ||
    info.firmwareBuildDate === null ||
    info.manufacturer === null ||
    info.firmwareVersionName === null
  ) {
    return writer;
  }
  writer
    .u8(Math.floor(info.maxContacts / 2))
    .u8(info.maxChannels)
    .u32(info.blePin)
    .fixedString(info.firmwareBuildDate, 12)
    .fixedString(info.manufacturer, 40)
    .fixedString(info.firmwareVersionName, 20);
  if (info.repeatEnabled !== null) {
    writer.u8(info.repeatEnabled ? 1 : 0);
    if (info.pathHashMode !== null) writer.u8(info.pathHashMode);
  }
  return writer;
}

export function writeChannelRecord(writer: ByteWriter, channel: ChannelRecord): ByteWriter {
  assertU8('index', channel.index);
  if (channel.secret.length !== CHANNEL_SECRET_SIZE) {
    throw new RangeError(`channel secret must be ${CHANNEL_SECRET_SIZE} bytes, got ${channel.secret.length}`);
  }
  return writer.u8(channel.index).fixedString(channel.name, NAME_FIELD_SIZE).bytes(channel.secret);
}
