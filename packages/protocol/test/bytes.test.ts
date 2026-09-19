import { describe, expect, it } from 'vitest';
import { ByteReader, ByteWriter, fromHex, toHex, utf8ByteLength } from '../src/bytes.js';

describe('hex', () => {
  it('round-trips bytes', () => {
    expect(toHex(Uint8Array.of(0x00, 0x0f, 0xff))).toBe('000fff');
    expect(fromHex('00 0F ff')).toEqual(Uint8Array.of(0x00, 0x0f, 0xff));
  });

  it('rejects invalid hex', () => {
    expect(() => fromHex('abc')).toThrow(RangeError);
    expect(() => fromHex('zz')).toThrow(RangeError);
  });
});

describe('utf8ByteLength', () => {
  it('counts bytes, not characters', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('🏓')).toBe(4);
  });
});

describe('ByteWriter / ByteReader', () => {
  it('writes and reads little-endian integers', () => {
    const bytes = new ByteWriter().u8(0xab).u16(0x1234).u32(0xdeadbeef).i32(-2).toBytes();
    expect(toHex(bytes)).toBe('ab3412efbeaddefeffffff');

    const reader = new ByteReader(bytes);
    expect(reader.u8()).toBe(0xab);
    expect(reader.u16()).toBe(0x1234);
    expect(reader.u32()).toBe(0xdeadbeef);
    expect(reader.i32()).toBe(-2);
    expect(reader.remaining).toBe(0);
  });

  it('reads int8', () => {
    expect(new ByteReader(Uint8Array.of(0xda)).i8()).toBe(-38);
  });

  it('pads fixed strings with NUL and reads them back', () => {
    const bytes = new ByteWriter().fixedString('Léa', 8).toBytes();
    expect(toHex(bytes)).toBe('4cc3a96100000000');
    expect(new ByteReader(bytes).fixedString(8)).toBe('Léa');
  });

  it('keeps room for the NUL terminator', () => {
    expect(() => new ByteWriter().fixedString('12345678', 8)).toThrow(RangeError);
    expect(() => new ByteWriter().fixedString('1234567', 8)).not.toThrow();
  });

  it('reads the rest of the frame as UTF-8', () => {
    const reader = new ByteReader(new ByteWriter().u8(1).string('pong 🏓').toBytes());
    reader.skip(1);
    expect(reader.restString()).toBe('pong 🏓');
  });

  it('throws RangeError when reading past the end', () => {
    const reader = new ByteReader(Uint8Array.of(1, 2, 3));
    expect(() => reader.u32()).toThrow(RangeError);
  });

  it('returns copies from bytes()', () => {
    const source = Uint8Array.of(1, 2, 3);
    const copy = new ByteReader(source).bytes(2);
    source[0] = 9;
    expect(copy).toEqual(Uint8Array.of(1, 2));
  });
});
