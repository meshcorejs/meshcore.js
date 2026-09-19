import { describe, expect, it } from 'vitest';
import { fromHex, toHex } from '../src/bytes.js';
import { decodeFrame } from '../src/decode/decode-frame.js';
import {
  encodeAdvertPush,
  encodeBattAndStorageResponse,
  encodeChannelInfoResponse,
  encodeChannelMessageResponse,
  encodeContactDeletedPush,
  encodeContactMessageResponse,
  encodeContactResponse,
  encodeContactsFullPush,
  encodeContactsStartResponse,
  encodeCurrentTimeResponse,
  encodeDeviceInfoResponse,
  encodeEndOfContactsResponse,
  encodeErrResponse,
  encodeExportContactResponse,
  encodeMsgWaitingPush,
  encodeNewAdvertPush,
  encodeNoMoreMessagesResponse,
  encodeOkResponse,
  encodePathUpdatedPush,
  encodeSelfInfoResponse,
  encodeSendConfirmedPush,
  encodeSentResponse,
} from '../src/responses.js';
import type { DecodedFrame } from '../src/types.js';
import { FRAMES, PUBLIC_KEY } from './fixtures.js';

function decodeAs<T extends DecodedFrame['type']>(hex: string, type: T): Extract<DecodedFrame, { type: T }> {
  const frame = decodeFrame(fromHex(hex));
  if (frame.type !== type) throw new Error(`expected ${type}, got ${frame.type}`);
  return frame as Extract<DecodedFrame, { type: T }>;
}

describe('response encoders reproduce the firmware fixtures', () => {
  it('records', () => {
    expect(toHex(encodeContactResponse(decodeAs(FRAMES.contact, 'contact').contact))).toBe(FRAMES.contact);
    expect(toHex(encodeNewAdvertPush(decodeAs(FRAMES.newAdvert, 'newAdvert').contact))).toBe(FRAMES.newAdvert);
    expect(toHex(encodeSelfInfoResponse(decodeAs(FRAMES.selfInfo, 'selfInfo').selfInfo))).toBe(FRAMES.selfInfo);
    expect(toHex(encodeDeviceInfoResponse(decodeAs(FRAMES.deviceInfo, 'deviceInfo').deviceInfo))).toBe(
      FRAMES.deviceInfo,
    );
    expect(toHex(encodeDeviceInfoResponse(decodeAs(FRAMES.deviceInfoOld, 'deviceInfo').deviceInfo))).toBe(
      FRAMES.deviceInfoOld,
    );
    expect(toHex(encodeChannelInfoResponse(decodeAs(FRAMES.channelInfo, 'channelInfo').channel))).toBe(
      FRAMES.channelInfo,
    );
  });

  it('messages', () => {
    for (const hex of [FRAMES.contactMessageV3, FRAMES.contactMessageV2, FRAMES.contactMessageSigned]) {
      expect(toHex(encodeContactMessageResponse(decodeAs(hex, 'contactMessage')))).toBe(hex);
    }
    expect(toHex(encodeChannelMessageResponse(decodeAs(FRAMES.channelMessageV3, 'channelMessage')))).toBe(
      FRAMES.channelMessageV3,
    );
  });

  it('sent, battery and send confirmation', () => {
    expect(toHex(encodeSentResponse(decodeAs(FRAMES.sent, 'sent')))).toBe(FRAMES.sent);
    expect(toHex(encodeBattAndStorageResponse(decodeAs(FRAMES.battAndStorage, 'battAndStorage')))).toBe(
      FRAMES.battAndStorage,
    );
    expect(toHex(encodeBattAndStorageResponse(decodeAs(FRAMES.battOnly, 'battAndStorage')))).toBe(FRAMES.battOnly);
    expect(toHex(encodeSendConfirmedPush(decodeAs(FRAMES.sendConfirmed, 'sendConfirmed')))).toBe(FRAMES.sendConfirmed);
  });
});

describe('small frames', () => {
  it('encode the expected bytes', () => {
    expect(toHex(encodeOkResponse())).toBe('00');
    expect(toHex(encodeErrResponse(2))).toBe('0102');
    expect(toHex(encodeContactsStartResponse(5))).toBe('0205000000');
    expect(toHex(encodeEndOfContactsResponse(1760000000))).toBe('040078e768');
    expect(toHex(encodeCurrentTimeResponse(1760000000))).toBe('090078e768');
    expect(toHex(encodeNoMoreMessagesResponse())).toBe('0a');
    expect(toHex(encodeAdvertPush(PUBLIC_KEY))).toBe(`80${PUBLIC_KEY}`);
    expect(toHex(encodePathUpdatedPush(PUBLIC_KEY))).toBe(`81${PUBLIC_KEY}`);
    expect(toHex(encodeMsgWaitingPush())).toBe('83');
    expect(toHex(encodeContactDeletedPush(PUBLIC_KEY))).toBe(`8f${PUBLIC_KEY}`);
    expect(toHex(encodeContactsFullPush())).toBe('90');
    expect(toHex(encodeExportContactResponse(fromHex('1011121314151617')))).toBe(FRAMES.exportContact);
  });

  it('validate their inputs', () => {
    expect(() => encodeErrResponse(256)).toThrow(RangeError);
    expect(() => encodeSentResponse({ flood: false, expectedAck: -1, suggestedTimeoutMs: 0 })).toThrow(RangeError);
    expect(() =>
      encodeContactMessageResponse({
        version: 3,
        snr: 0,
        senderPrefix: '1011',
        pathLen: 0,
        txtType: 0,
        senderTimestamp: 0,
        signature: null,
        text: '',
      }),
    ).toThrow(RangeError);
  });
});
