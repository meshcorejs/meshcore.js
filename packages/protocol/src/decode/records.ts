import { type ByteReader, toHex } from '../bytes.js';
import { CHANNEL_SECRET_SIZE, MAX_PATH_SIZE, NAME_FIELD_SIZE, PUB_KEY_SIZE } from '../constants.js';
import { decodePath } from '../path.js';
import type { ChannelRecord, ContactRecord, DeviceInfo, SelfInfo } from '../types.js';

const fromMicroDegrees = (value: number): number => value / 1_000_000;

export function readContactRecord(reader: ByteReader): ContactRecord {
  const publicKey = toHex(reader.bytes(PUB_KEY_SIZE));
  const type = reader.u8();
  const flags = reader.u8();
  const pathLen = reader.u8();
  const rawPath = reader.bytes(MAX_PATH_SIZE);
  const name = reader.fixedString(NAME_FIELD_SIZE);
  const lastAdvertTimestamp = reader.u32();
  const latitude = fromMicroDegrees(reader.i32());
  const longitude = fromMicroDegrees(reader.i32());
  const lastModified = reader.u32();
  return {
    publicKey,
    type,
    flags,
    outPath: decodePath(pathLen, rawPath),
    name,
    lastAdvertTimestamp,
    latitude,
    longitude,
    lastModified,
  };
}

export function readSelfInfo(reader: ByteReader): SelfInfo {
  const advertType = reader.u8();
  const txPowerDbm = reader.u8();
  const maxTxPowerDbm = reader.u8();
  const publicKey = toHex(reader.bytes(PUB_KEY_SIZE));
  const latitude = fromMicroDegrees(reader.i32());
  const longitude = fromMicroDegrees(reader.i32());
  const multiAcks = reader.u8();
  const advertLocationPolicy = reader.u8();
  const telemetry = reader.u8();
  const manualAddContacts = reader.u8() !== 0;
  const frequencyKhz = reader.u32();
  const bandwidthHz = reader.u32();
  const spreadingFactor = reader.u8();
  const codingRate = reader.u8();
  const name = reader.restString();
  return {
    advertType,
    txPowerDbm,
    maxTxPowerDbm,
    publicKey,
    latitude,
    longitude,
    multiAcks,
    advertLocationPolicy,
    telemetryModes: {
      base: telemetry & 0b11,
      location: (telemetry >> 2) & 0b11,
      environment: (telemetry >> 4) & 0b1111,
    },
    manualAddContacts,
    radio: { frequencyKhz, bandwidthHz, spreadingFactor, codingRate },
    name,
  };
}

const DEVICE_INFO_V3_BLOCK = 1 + 1 + 4 + 12 + 40 + 20;

export function readDeviceInfo(reader: ByteReader): DeviceInfo {
  const info: DeviceInfo = {
    firmwareVersion: reader.u8(),
    maxContacts: null,
    maxChannels: null,
    blePin: null,
    firmwareBuildDate: null,
    manufacturer: null,
    firmwareVersionName: null,
    repeatEnabled: null,
    pathHashMode: null,
  };
  if (reader.remaining < DEVICE_INFO_V3_BLOCK) return info;
  info.maxContacts = reader.u8() * 2;
  info.maxChannels = reader.u8();
  info.blePin = reader.u32();
  info.firmwareBuildDate = reader.fixedString(12);
  info.manufacturer = reader.fixedString(40);
  info.firmwareVersionName = reader.fixedString(20);
  if (reader.remaining >= 1) info.repeatEnabled = reader.u8() !== 0;
  if (reader.remaining >= 1) info.pathHashMode = reader.u8();
  return info;
}

export function readChannelRecord(reader: ByteReader): ChannelRecord {
  return {
    index: reader.u8(),
    name: reader.fixedString(NAME_FIELD_SIZE),
    secret: reader.bytes(CHANNEL_SECRET_SIZE),
  };
}
