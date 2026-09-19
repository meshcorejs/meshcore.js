import { describe, expect, it } from 'vitest';
import { fromHex, toHex } from '../src/bytes.js';
import {
  encodeAddUpdateContact,
  encodeAppStart,
  encodeDeviceQuery,
  encodeExportContact,
  encodeGetBattAndStorage,
  encodeGetChannel,
  encodeGetContactByKey,
  encodeGetContacts,
  encodeGetDeviceTime,
  encodeRemoveContact,
  encodeResetPath,
  encodeSendChannelTxtMsg,
  encodeSendSelfAdvert,
  encodeSendTxtMsg,
  encodeSetAdvertLatLon,
  encodeSetAdvertName,
  encodeSetChannel,
  encodeSetDeviceTime,
  encodeSetRadioParams,
  encodeSetRadioTxPower,
  encodeSyncNextMessage,
} from '../src/commands.js';
import { decodeFrame } from '../src/decode/decode-frame.js';
import { FRAMES, PUBLIC_KEY } from './fixtures.js';

describe('command encoders', () => {
  it('APP_START: code, 7 reserved bytes, app name', () => {
    expect(toHex(encodeAppStart('meshcore.js'))).toBe('01000000000000006d657368636f72652e6a73');
  });

  it('DEVICE_QUERY announces protocol version 3 by default', () => {
    expect(toHex(encodeDeviceQuery())).toBe('1603');
    expect(toHex(encodeDeviceQuery(2))).toBe('1602');
  });

  it('SEND_TXT_MSG: type, attempt, timestamp, 6-byte key prefix, UTF-8 text', () => {
    const frame = encodeSendTxtMsg({ recipient: PUBLIC_KEY, text: 'pong 🏓', timestamp: 1760000500, attempt: 1 });
    expect(toHex(frame)).toBe('020001f479e768101112131415706f6e6720f09f8f93');
  });

  it('SEND_TXT_MSG rejects text over 160 bytes', () => {
    const base = { recipient: PUBLIC_KEY, timestamp: 1 };
    expect(() => encodeSendTxtMsg({ ...base, text: 'a'.repeat(160) })).not.toThrow();
    expect(() => encodeSendTxtMsg({ ...base, text: 'a'.repeat(161) })).toThrow(RangeError);
    expect(() => encodeSendTxtMsg({ ...base, text: '🏓'.repeat(41) })).toThrow(RangeError);
  });

  it('SEND_CHANNEL_TXT_MSG: plain type, channel index, timestamp, text', () => {
    expect(toHex(encodeSendChannelTxtMsg({ channelIndex: 2, text: 'hello', timestamp: 1760000500 }))).toBe(
      '030002f479e76868656c6c6f',
    );
  });

  it('EXPORT_CONTACT: this node without a key, another contact with one', () => {
    expect(toHex(encodeExportContact())).toBe('11');
    expect(toHex(encodeExportContact(PUBLIC_KEY))).toBe(`11${PUBLIC_KEY}`);
  });

  it('GET_CONTACTS with and without since', () => {
    expect(toHex(encodeGetContacts())).toBe('04');
    expect(toHex(encodeGetContacts(1760000000))).toBe('040078e768');
  });

  it('single-byte commands', () => {
    expect(toHex(encodeGetDeviceTime())).toBe('05');
    expect(toHex(encodeSyncNextMessage())).toBe('0a');
    expect(toHex(encodeGetBattAndStorage())).toBe('14');
  });

  it('SET_DEVICE_TIME', () => {
    expect(toHex(encodeSetDeviceTime(1760000000))).toBe('060078e768');
    expect(() => encodeSetDeviceTime(-1)).toThrow(RangeError);
  });

  it('SEND_SELF_ADVERT flood flag', () => {
    expect(toHex(encodeSendSelfAdvert({ flood: true }))).toBe('0701');
    expect(toHex(encodeSendSelfAdvert({ flood: false }))).toBe('0700');
  });

  it('commands addressed by full public key', () => {
    expect(toHex(encodeResetPath(PUBLIC_KEY))).toBe(`0d${PUBLIC_KEY}`);
    expect(toHex(encodeRemoveContact(PUBLIC_KEY))).toBe(`0f${PUBLIC_KEY}`);
    expect(toHex(encodeGetContactByKey(PUBLIC_KEY))).toBe(`1e${PUBLIC_KEY}`);
    expect(() => encodeResetPath('101112131415')).toThrow(RangeError);
  });

  it('GET_CHANNEL / SET_CHANNEL', () => {
    expect(toHex(encodeGetChannel(3))).toBe('1f03');
    const secret = fromHex('a0a1a2a3a4a5a6a7a8a9aaabacadaeaf');
    expect(toHex(encodeSetChannel({ index: 3, name: '#lyon', secret }))).toBe(`20${FRAMES.channelInfo.slice(2)}`);
    expect(() => encodeSetChannel({ index: 3, name: '#lyon', secret: new Uint8Array(15) })).toThrow(RangeError);
  });

  it('ADD_UPDATE_CONTACT uses the contact frame layout', () => {
    const decoded = decodeFrame(fromHex(FRAMES.contact));
    if (decoded.type !== 'contact') throw new Error(`expected contact, got ${decoded.type}`);
    expect(toHex(encodeAddUpdateContact(decoded.contact))).toBe(`09${FRAMES.contact.slice(2)}`);
  });

  it('SET_ADVERT_NAME: code then raw UTF-8 bytes', () => {
    expect(toHex(encodeSetAdvertName('TrainBot'))).toBe('08547261696e426f74');
    expect(toHex(encodeSetAdvertName('Léa'))).toBe('084cc3a961');
  });

  it('SET_ADVERT_NAME rejects empty and over-long names', () => {
    expect(() => encodeSetAdvertName('')).toThrow(RangeError);
    expect(() => encodeSetAdvertName('a'.repeat(31))).not.toThrow();
    expect(() => encodeSetAdvertName('a'.repeat(32))).toThrow(RangeError);
    expect(() => encodeSetAdvertName('é'.repeat(16))).toThrow(RangeError); // 32 bytes
  });

  it('SET_ADVERT_LATLON: code, lat and lon as i32 micro-degrees LE', () => {
    expect(toHex(encodeSetAdvertLatLon({ latitude: 43.6045, longitude: 1.4442 }))).toBe('0e145a990268091600');
    expect(toHex(encodeSetAdvertLatLon({ latitude: -33.8688, longitude: 151.2093 }))).toBe('0e0034fbfd54450309');
  });

  it('SET_ADVERT_LATLON rejects coordinates outside the globe', () => {
    expect(() => encodeSetAdvertLatLon({ latitude: 90.0001, longitude: 0 })).toThrow(RangeError);
    expect(() => encodeSetAdvertLatLon({ latitude: 0, longitude: -180.5 })).toThrow(RangeError);
    expect(() => encodeSetAdvertLatLon({ latitude: Number.NaN, longitude: 0 })).toThrow(RangeError);
  });

  it('SET_RADIO_TX_POWER: code then i8 dBm', () => {
    expect(toHex(encodeSetRadioTxPower(22))).toBe('0c16');
    expect(toHex(encodeSetRadioTxPower(-9))).toBe('0cf7');
    expect(() => encodeSetRadioTxPower(128)).toThrow(RangeError);
    expect(() => encodeSetRadioTxPower(1.5)).toThrow(RangeError);
  });

  it('SET_RADIO_PARAMS: freq kHz u32, bw Hz u32, sf, cr, optional repeat byte', () => {
    const params = { frequencyKhz: 869525, bandwidthHz: 250000, spreadingFactor: 11, codingRate: 5 };
    expect(toHex(encodeSetRadioParams(params))).toBe('0b95440d0090d003000b05');
    expect(toHex(encodeSetRadioParams({ ...params, repeat: false }))).toBe('0b95440d0090d003000b0500');
    expect(toHex(encodeSetRadioParams({ ...params, repeat: true }))).toBe('0b95440d0090d003000b0501');
  });

  it('SET_RADIO_PARAMS validates integer ranges like the firmware', () => {
    const params = { frequencyKhz: 869525, bandwidthHz: 250000, spreadingFactor: 11, codingRate: 5 };
    expect(() => encodeSetRadioParams({ ...params, frequencyKhz: 149999 })).toThrow(RangeError);
    expect(() => encodeSetRadioParams({ ...params, frequencyKhz: 2500001 })).toThrow(RangeError);
    expect(() => encodeSetRadioParams({ ...params, bandwidthHz: 6999 })).toThrow(RangeError);
    expect(() => encodeSetRadioParams({ ...params, bandwidthHz: 500001 })).toThrow(RangeError);
    expect(() => encodeSetRadioParams({ ...params, spreadingFactor: 4 })).toThrow(RangeError);
    expect(() => encodeSetRadioParams({ ...params, spreadingFactor: 13 })).toThrow(RangeError);
    expect(() => encodeSetRadioParams({ ...params, codingRate: 4 })).toThrow(RangeError);
    expect(() => encodeSetRadioParams({ ...params, codingRate: 9 })).toThrow(RangeError);
  });
});
