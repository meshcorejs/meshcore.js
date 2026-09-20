import { ByteWriter, fromHex } from './bytes.js';
import { PUB_KEY_PREFIX_SIZE, PushCode, ResponseCode, TxtType } from './constants.js';
import {
  assertU8,
  assertU16,
  assertU32,
  writeChannelRecord,
  writeContactRecord,
  writeDeviceInfo,
  writeSelfInfo,
} from './encode/records.js';
import { publicKeyToBytes } from './keys.js';
import type {
  ChannelMessageFrame,
  ChannelRecord,
  ContactMessageFrame,
  ContactRecord,
  DeviceInfo,
  SelfInfo,
} from './types.js';

/** Encode an `Ok` response (what a fake radio answers to most commands). */
export function encodeOkResponse(): Uint8Array {
  return Uint8Array.of(ResponseCode.Ok);
}

/** Encode an `Err` response with a `RadioErrorCode`. */
export function encodeErrResponse(errorCode: number): Uint8Array {
  assertU8('errorCode', errorCode);
  return Uint8Array.of(ResponseCode.Err, errorCode);
}

/** Encode `ContactsStart`, opening a contact listing with the number of contacts to follow. */
export function encodeContactsStartResponse(total: number): Uint8Array {
  assertU32('total', total);
  return new ByteWriter().u8(ResponseCode.ContactsStart).u32(total).toBytes();
}

/** Encode one `Contact` of a listing. */
export function encodeContactResponse(contact: ContactRecord): Uint8Array {
  return writeContactRecord(new ByteWriter().u8(ResponseCode.Contact), contact).toBytes();
}

/** Encode `EndOfContacts`, closing a listing with the newest `lastModified`. */
export function encodeEndOfContactsResponse(mostRecentLastModified: number): Uint8Array {
  assertU32('mostRecentLastModified', mostRecentLastModified);
  return new ByteWriter().u8(ResponseCode.EndOfContacts).u32(mostRecentLastModified).toBytes();
}

/** Encode `ExportContact` with an advert packet. */
export function encodeExportContactResponse(packet: Uint8Array): Uint8Array {
  return new ByteWriter().u8(ResponseCode.ExportContact).bytes(packet).toBytes();
}

/** Encode `SelfInfo`, the answer to `APP_START`. */
export function encodeSelfInfoResponse(info: SelfInfo): Uint8Array {
  return writeSelfInfo(new ByteWriter().u8(ResponseCode.SelfInfo), info).toBytes();
}

/** Encode `Sent`, the answer to a text message: flood or direct, expected ack and suggested timeout. */
export function encodeSentResponse(params: {
  flood: boolean;
  expectedAck: number;
  suggestedTimeoutMs: number;
}): Uint8Array {
  assertU32('expectedAck', params.expectedAck);
  assertU32('suggestedTimeoutMs', params.suggestedTimeoutMs);
  return new ByteWriter()
    .u8(ResponseCode.Sent)
    .u8(params.flood ? 1 : 0)
    .u32(params.expectedAck)
    .u32(params.suggestedTimeoutMs)
    .toBytes();
}

/**
 * Parameters accepted by {@link encodeContactMessageResponse}: a {@link ContactMessageFrame} without its
 * derived fields.
 */
export type ContactMessageParams = Omit<ContactMessageFrame, 'kind' | 'type' | 'hopCount'>;

/** Encode a received direct message (`ContactMsgRecv`, version 2 or 3). */
export function encodeContactMessageResponse(message: ContactMessageParams): Uint8Array {
  const writer = new ByteWriter();
  if (message.version === 3) {
    writer
      .u8(ResponseCode.ContactMsgRecvV3)
      .u8(Math.round((message.snr ?? 0) * 4) & 0xff)
      .zeros(2);
  } else {
    writer.u8(ResponseCode.ContactMsgRecv);
  }
  const prefix = fromHex(message.senderPrefix);
  if (prefix.length !== PUB_KEY_PREFIX_SIZE) {
    throw new RangeError(`senderPrefix must be ${PUB_KEY_PREFIX_SIZE * 2} hex characters`);
  }
  assertU8('pathLen', message.pathLen);
  assertU8('txtType', message.txtType);
  assertU32('senderTimestamp', message.senderTimestamp);
  writer.bytes(prefix).u8(message.pathLen).u8(message.txtType).u32(message.senderTimestamp);
  if (message.txtType === TxtType.SignedPlain) {
    const signature = fromHex(message.signature ?? '00000000');
    if (signature.length !== 4) throw new RangeError('signature must be 8 hex characters');
    writer.bytes(signature);
  }
  return writer.string(message.text).toBytes();
}

/**
 * Parameters accepted by {@link encodeChannelMessageResponse}: a {@link ChannelMessageFrame} without its
 * derived fields.
 */
export type ChannelMessageParams = Omit<ChannelMessageFrame, 'kind' | 'type' | 'hopCount'>;

/** Encode a received channel message (`ChannelMsgRecv`, version 2 or 3). */
export function encodeChannelMessageResponse(message: ChannelMessageParams): Uint8Array {
  const writer = new ByteWriter();
  if (message.version === 3) {
    writer
      .u8(ResponseCode.ChannelMsgRecvV3)
      .u8(Math.round((message.snr ?? 0) * 4) & 0xff)
      .zeros(2);
  } else {
    writer.u8(ResponseCode.ChannelMsgRecv);
  }
  assertU8('channelIndex', message.channelIndex);
  assertU8('pathLen', message.pathLen);
  assertU8('txtType', message.txtType);
  assertU32('senderTimestamp', message.senderTimestamp);
  return writer
    .u8(message.channelIndex)
    .u8(message.pathLen)
    .u8(message.txtType)
    .u32(message.senderTimestamp)
    .string(message.text)
    .toBytes();
}

/** Encode `CurrTime` with the radio's clock. */
export function encodeCurrentTimeResponse(epochSeconds: number): Uint8Array {
  assertU32('epochSeconds', epochSeconds);
  return new ByteWriter().u8(ResponseCode.CurrTime).u32(epochSeconds).toBytes();
}

/** Encode `NoMoreMessages`, the answer to `SYNC_NEXT_MESSAGE` when the queue is empty. */
export function encodeNoMoreMessagesResponse(): Uint8Array {
  return Uint8Array.of(ResponseCode.NoMoreMessages);
}

/** Encode `BattAndStorage`: battery millivolts and storage usage. */
export function encodeBattAndStorageResponse(params: {
  batteryMillivolts: number;
  storageUsedKb: number | null;
  storageTotalKb: number | null;
}): Uint8Array {
  assertU16('batteryMillivolts', params.batteryMillivolts);
  const writer = new ByteWriter().u8(ResponseCode.BattAndStorage).u16(params.batteryMillivolts);
  if (params.storageUsedKb !== null && params.storageTotalKb !== null) {
    writer.u32(params.storageUsedKb).u32(params.storageTotalKb);
  }
  return writer.toBytes();
}

/** Encode `DeviceInfo`, the answer to `DEVICE_QUERY`. */
export function encodeDeviceInfoResponse(info: DeviceInfo): Uint8Array {
  return writeDeviceInfo(new ByteWriter().u8(ResponseCode.DeviceInfo), info).toBytes();
}

/** Encode `ChannelInfo`, the answer to `GET_CHANNEL`. */
export function encodeChannelInfoResponse(channel: ChannelRecord): Uint8Array {
  return writeChannelRecord(new ByteWriter().u8(ResponseCode.ChannelInfo), channel).toBytes();
}

/** Encode the `Advert` push: a known contact advertised again. */
export function encodeAdvertPush(publicKey: string): Uint8Array {
  return new ByteWriter().u8(PushCode.Advert).bytes(publicKeyToBytes(publicKey)).toBytes();
}

/** Encode the `PathUpdated` push: the route to a contact changed. */
export function encodePathUpdatedPush(publicKey: string): Uint8Array {
  return new ByteWriter().u8(PushCode.PathUpdated).bytes(publicKeyToBytes(publicKey)).toBytes();
}

/** Encode the `SendConfirmed` push: a direct message was acknowledged. */
export function encodeSendConfirmedPush(params: { ack: number; roundTripMs: number }): Uint8Array {
  assertU32('ack', params.ack);
  assertU32('roundTripMs', params.roundTripMs);
  return new ByteWriter().u8(PushCode.SendConfirmed).u32(params.ack).u32(params.roundTripMs).toBytes();
}

/** Encode the `MsgWaiting` push: a message is ready for `SYNC_NEXT_MESSAGE`. */
export function encodeMsgWaitingPush(): Uint8Array {
  return Uint8Array.of(PushCode.MsgWaiting);
}

/** Encode the `NewAdvert` push: an unknown node advertised (manual-add mode). */
export function encodeNewAdvertPush(contact: ContactRecord): Uint8Array {
  return writeContactRecord(new ByteWriter().u8(PushCode.NewAdvert), contact).toBytes();
}

/** Encode the `ContactDeleted` push. */
export function encodeContactDeletedPush(publicKey: string): Uint8Array {
  return new ByteWriter().u8(PushCode.ContactDeleted).bytes(publicKeyToBytes(publicKey)).toBytes();
}

/** Encode the `ContactsFull` push: the contact table cannot take another entry. */
export function encodeContactsFullPush(): Uint8Array {
  return Uint8Array.of(PushCode.ContactsFull);
}
