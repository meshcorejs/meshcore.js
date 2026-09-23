import { describe, expect, it } from 'vitest';
import { CHANNEL_SECRET_SIZE, PUBLIC_CHANNEL_SECRET } from '../src/index.js';

describe('PUBLIC_CHANNEL_SECRET', () => {
  it('is the firmware PUBLIC_GROUP_PSK, decoded from its base64 form', () => {
    // examples/companion_radio/MyMesh.cpp: #define PUBLIC_GROUP_PSK "izOH6cXN6mrJ5e26oRXNcg=="
    const expected = Uint8Array.from(Buffer.from('izOH6cXN6mrJ5e26oRXNcg==', 'base64'));
    expect(PUBLIC_CHANNEL_SECRET).toHaveLength(CHANNEL_SECRET_SIZE);
    expect(Buffer.from(PUBLIC_CHANNEL_SECRET).toString('hex')).toBe('8b3387e9c5cdea6ac9e5edbaa115cd72');
    expect(PUBLIC_CHANNEL_SECRET).toEqual(expected);
  });
});
