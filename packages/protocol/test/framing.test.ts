import { describe, expect, it } from 'vitest';
import { fromHex, toHex } from '../src/bytes.js';
import { MAX_FRAME_SIZE } from '../src/constants.js';
import { encodeFrame, FrameDecoder } from '../src/framing.js';

describe('encodeFrame', () => {
  it("prefixes app->radio frames with '<' and a little-endian length", () => {
    expect(toHex(encodeFrame(Uint8Array.of(0x16, 0x03)))).toBe('3c02001603');
  });

  it("prefixes radio->app frames with '>'", () => {
    expect(toHex(encodeFrame(Uint8Array.of(0x00), 'fromRadio'))).toBe('3e010000');
  });

  it('rejects empty and oversized payloads', () => {
    expect(() => encodeFrame(new Uint8Array(0))).toThrow(RangeError);
    expect(() => encodeFrame(new Uint8Array(MAX_FRAME_SIZE + 1))).toThrow(RangeError);
    expect(() => encodeFrame(new Uint8Array(MAX_FRAME_SIZE))).not.toThrow();
  });
});

describe('FrameDecoder', () => {
  it('decodes a complete frame', () => {
    const decoder = new FrameDecoder();
    expect(decoder.push(fromHex('3e0100 00'))).toEqual([Uint8Array.of(0x00)]);
  });

  it('reassembles a frame split across chunks', () => {
    const decoder = new FrameDecoder();
    expect(decoder.push(fromHex('3e'))).toEqual([]);
    expect(decoder.push(fromHex('0300'))).toEqual([]);
    expect(decoder.push(fromHex('0a0b'))).toEqual([]);
    expect(decoder.push(fromHex('0c'))).toEqual([Uint8Array.of(0x0a, 0x0b, 0x0c)]);
  });

  it('returns several frames from one chunk', () => {
    const decoder = new FrameDecoder();
    expect(decoder.push(fromHex('3e010000 3e01000a'))).toEqual([Uint8Array.of(0x00), Uint8Array.of(0x0a)]);
  });

  it('skips garbage before a marker', () => {
    const decoder = new FrameDecoder();
    expect(decoder.push(fromHex('ff00123c 3e01000a'))).toEqual([Uint8Array.of(0x0a)]);
  });

  it('ignores zero-length and oversized headers, then resynchronises', () => {
    const decoder = new FrameDecoder();
    expect(decoder.push(fromHex('3e0000 3eff00 3e01000a'))).toEqual([Uint8Array.of(0x0a)]);
  });

  it('only accepts the marker of its direction', () => {
    expect(new FrameDecoder('fromRadio').push(fromHex('3c01000a'))).toEqual([]);
    expect(new FrameDecoder('toRadio').push(fromHex('3c01000a'))).toEqual([Uint8Array.of(0x0a)]);
  });

  it('round-trips with encodeFrame', () => {
    const payload = Uint8Array.from({ length: MAX_FRAME_SIZE }, (_, i) => i % 256);
    expect(new FrameDecoder('toRadio').push(encodeFrame(payload))).toEqual([payload]);
  });

  it('drops a partial frame on reset', () => {
    const decoder = new FrameDecoder();
    decoder.push(fromHex('3e05000102'));
    decoder.reset();
    expect(decoder.push(fromHex('3e01000a'))).toEqual([Uint8Array.of(0x0a)]);
  });
});
