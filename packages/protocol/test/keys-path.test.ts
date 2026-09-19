import { describe, expect, it } from 'vitest';
import { toHex } from '../src/bytes.js';
import { isPublicKeyHex, publicKeyPrefixToBytes, publicKeyToBytes } from '../src/keys.js';
import { decodePath, decodePathLength, encodePath } from '../src/path.js';
import { PUBLIC_KEY } from './fixtures.js';

describe('public keys', () => {
  it('validates full keys', () => {
    expect(isPublicKeyHex(PUBLIC_KEY)).toBe(true);
    expect(isPublicKeyHex(PUBLIC_KEY.slice(2))).toBe(false);
    expect(toHex(publicKeyToBytes(PUBLIC_KEY.toUpperCase()))).toBe(PUBLIC_KEY);
    expect(() => publicKeyToBytes('abcd')).toThrow(RangeError);
  });

  it('extracts a 6-byte prefix from a key or a long enough prefix', () => {
    expect(toHex(publicKeyPrefixToBytes(PUBLIC_KEY))).toBe('101112131415');
    expect(toHex(publicKeyPrefixToBytes('101112131415'))).toBe('101112131415');
    expect(() => publicKeyPrefixToBytes('1011121314')).toThrow(RangeError);
  });
});

describe('path length byte', () => {
  it('treats 0xff as unknown', () => {
    expect(decodePathLength(0xff)).toBeNull();
  });

  it('splits hop count and hash size', () => {
    expect(decodePathLength(0x03)).toEqual({ hashSize: 1, hopCount: 3, byteLength: 3 });
    expect(decodePathLength(0x42)).toEqual({ hashSize: 2, hopCount: 2, byteLength: 4 });
  });

  it('rejects reserved or oversized encodings', () => {
    expect(() => decodePathLength(0xc1)).toThrow(RangeError);
    expect(() => decodePathLength(0x80 | 30)).toThrow(RangeError);
  });
});

describe('paths', () => {
  it('decodes hops from the raw 64-byte buffer', () => {
    const raw = new Uint8Array(64);
    raw.set([0xa1, 0xb2, 0xc3, 0xd4]);
    expect(decodePath(0x42, raw)).toEqual({
      hashSize: 2,
      hops: [Uint8Array.of(0xa1, 0xb2), Uint8Array.of(0xc3, 0xd4)],
    });
    expect(decodePath(0xff, raw)).toBeNull();
  });

  it('encodes a path back to length byte and padded buffer', () => {
    const encoded = encodePath({ hashSize: 1, hops: [Uint8Array.of(0xa1), Uint8Array.of(0xb2)] });
    expect(encoded.pathLen).toBe(2);
    expect(encoded.bytes.length).toBe(64);
    expect(Array.from(encoded.bytes.subarray(0, 3))).toEqual([0xa1, 0xb2, 0]);
    expect(encodePath(null).pathLen).toBe(0xff);
  });

  it('rejects hops of the wrong size', () => {
    expect(() => encodePath({ hashSize: 2, hops: [Uint8Array.of(1)] })).toThrow(RangeError);
  });
});
