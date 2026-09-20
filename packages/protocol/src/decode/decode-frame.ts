import { ByteReader, toHex } from '../bytes.js';
import { PUB_KEY_PREFIX_SIZE, PUB_KEY_SIZE, PushCode, ResponseCode, TxtType } from '../constants.js';
import { decodePathLength } from '../path.js';
import type { DecodedFrame, PushFrame, ResponseFrame } from '../types.js';
import { readChannelRecord, readContactRecord, readDeviceInfo, readSelfInfo } from './records.js';

type Decoder = (reader: ByteReader, code: number) => ResponseFrame | PushFrame;

const response = { kind: 'response' } as const;
const push = { kind: 'push' } as const;

function hopCount(pathLen: number): number | null {
  return decodePathLength(pathLen)?.hopCount ?? null;
}

function readV3Header(reader: ByteReader, isV3: boolean): number | null {
  if (!isV3) return null;
  const snr = reader.i8() / 4;
  reader.skip(2);
  return snr;
}

const decoders: Record<number, Decoder> = {
  [ResponseCode.Ok]: () => ({ ...response, type: 'ok' }),
  [ResponseCode.Err]: (r) => ({ ...response, type: 'err', errorCode: r.remaining > 0 ? r.u8() : null }),
  [ResponseCode.Disabled]: () => ({ ...response, type: 'disabled' }),
  [ResponseCode.ContactsStart]: (r) => ({ ...response, type: 'contactsStart', total: r.u32() }),
  [ResponseCode.Contact]: (r) => ({ ...response, type: 'contact', contact: readContactRecord(r) }),
  [ResponseCode.EndOfContacts]: (r) => ({ ...response, type: 'endOfContacts', mostRecentLastModified: r.u32() }),
  [ResponseCode.ExportContact]: (r) => ({ ...response, type: 'exportContact', packet: r.bytes(r.remaining) }),
  [ResponseCode.SelfInfo]: (r) => ({ ...response, type: 'selfInfo', selfInfo: readSelfInfo(r) }),
  [ResponseCode.Sent]: (r) => ({
    ...response,
    type: 'sent',
    flood: r.u8() === 1,
    expectedAck: r.u32(),
    suggestedTimeoutMs: r.u32(),
  }),
  [ResponseCode.ContactMsgRecv]: decodeContactMessage,
  [ResponseCode.ContactMsgRecvV3]: decodeContactMessage,
  [ResponseCode.ChannelMsgRecv]: decodeChannelMessage,
  [ResponseCode.ChannelMsgRecvV3]: decodeChannelMessage,
  [ResponseCode.CurrTime]: (r) => ({ ...response, type: 'currentTime', epochSeconds: r.u32() }),
  [ResponseCode.NoMoreMessages]: () => ({ ...response, type: 'noMoreMessages' }),
  [ResponseCode.BattAndStorage]: (r) => {
    const batteryMillivolts = r.u16();
    const hasStorage = r.remaining >= 8;
    return {
      ...response,
      type: 'battAndStorage',
      batteryMillivolts,
      storageUsedKb: hasStorage ? r.u32() : null,
      storageTotalKb: hasStorage ? r.u32() : null,
    };
  },
  [ResponseCode.DeviceInfo]: (r) => ({ ...response, type: 'deviceInfo', deviceInfo: readDeviceInfo(r) }),
  [ResponseCode.ChannelInfo]: (r) => ({ ...response, type: 'channelInfo', channel: readChannelRecord(r) }),

  [PushCode.Advert]: (r) => ({ ...push, type: 'advert', publicKey: toHex(r.bytes(PUB_KEY_SIZE)) }),
  [PushCode.PathUpdated]: (r) => ({ ...push, type: 'pathUpdated', publicKey: toHex(r.bytes(PUB_KEY_SIZE)) }),
  [PushCode.SendConfirmed]: (r) => ({ ...push, type: 'sendConfirmed', ack: r.u32(), roundTripMs: r.u32() }),
  [PushCode.MsgWaiting]: () => ({ ...push, type: 'msgWaiting' }),
  [PushCode.NewAdvert]: (r) => ({ ...push, type: 'newAdvert', contact: readContactRecord(r) }),
  [PushCode.ContactDeleted]: (r) => ({ ...push, type: 'contactDeleted', publicKey: toHex(r.bytes(PUB_KEY_SIZE)) }),
  [PushCode.ContactsFull]: () => ({ ...push, type: 'contactsFull' }),
};

function decodeContactMessage(r: ByteReader, code: number): ResponseFrame {
  const isV3 = code === ResponseCode.ContactMsgRecvV3;
  const snr = readV3Header(r, isV3);
  const senderPrefix = toHex(r.bytes(PUB_KEY_PREFIX_SIZE));
  const pathLen = r.u8();
  const txtType = r.u8();
  const senderTimestamp = r.u32();
  const signature = txtType === TxtType.SignedPlain ? toHex(r.bytes(4)) : null;
  return {
    ...response,
    type: 'contactMessage',
    version: isV3 ? 3 : 2,
    snr,
    senderPrefix,
    pathLen,
    hopCount: hopCount(pathLen),
    txtType,
    senderTimestamp,
    signature,
    text: r.restString(),
  };
}

function decodeChannelMessage(r: ByteReader, code: number): ResponseFrame {
  const isV3 = code === ResponseCode.ChannelMsgRecvV3;
  const snr = readV3Header(r, isV3);
  const channelIndex = r.u8();
  const pathLen = r.u8();
  const txtType = r.u8();
  const senderTimestamp = r.u32();
  return {
    ...response,
    type: 'channelMessage',
    version: isV3 ? 3 : 2,
    snr,
    channelIndex,
    pathLen,
    hopCount: hopCount(pathLen),
    txtType,
    senderTimestamp,
    text: r.restString(),
  };
}

/**
 * Decode one radio → app payload into a typed frame: a response, a push, `unknown` for a code this codec does not know, `malformed` when the bytes do not fit the layout.
 * @param bytes Frame payload without framing
 */
export function decodeFrame(bytes: Uint8Array): DecodedFrame {
  const code = bytes[0];
  if (code === undefined) {
    return { kind: 'response', type: 'malformed', code: -1, bytes, reason: 'empty frame' };
  }
  const kind = code >= 0x80 ? 'push' : 'response';
  const decoder = decoders[code];
  if (!decoder) return { kind, type: 'unknown', code, bytes };
  try {
    return decoder(new ByteReader(bytes.subarray(1)), code);
  } catch (error) {
    if (error instanceof RangeError) return { kind, type: 'malformed', code, bytes, reason: error.message };
    throw error;
  }
}
