import { describe, expect, it } from 'vitest';
import { fromHex } from '../src/bytes.js';
import { CONTACT_URI_PREFIX, contactUri, parseContactUri } from '../src/contact-uri.js';

describe('contact URI', () => {
  it('builds the meshcore:// card shared by apps and QR codes', () => {
    expect(contactUri(fromHex('1011121314151617'))).toBe(`${CONTACT_URI_PREFIX}1011121314151617`);
  });

  it('reads a card back, ignoring case and spacing', () => {
    expect(parseContactUri('  MESHCORE://1011  ')).toEqual(fromHex('1011'));
  });

  it('rejects anything else', () => {
    expect(() => parseContactUri('https://example.com')).toThrow(RangeError);
    expect(() => parseContactUri(`${CONTACT_URI_PREFIX}zz`)).toThrow(RangeError);
  });
});
