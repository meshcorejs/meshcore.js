import { fromHex } from './bytes.js';
import { PUB_KEY_PREFIX_SIZE, PUB_KEY_SIZE } from './constants.js';

const FULL_KEY = /^[0-9a-f]{64}$/;

/**
 * Whether `value` is a full public key: 64 lowercase hex characters.
 * @param value Candidate 64 hex characters
 */
export function isPublicKeyHex(value: string): boolean {
  return FULL_KEY.test(value);
}

/**
 * The 32 bytes of a full public key.
 * @param publicKey 64 hex characters
 */
export function publicKeyToBytes(publicKey: string): Uint8Array {
  const normalized = publicKey.toLowerCase();
  if (!FULL_KEY.test(normalized)) {
    throw new RangeError(`public key must be ${PUB_KEY_SIZE * 2} hex characters, got "${publicKey}"`);
  }
  return fromHex(normalized);
}

/**
 * The first 6 bytes of a public key or key prefix, as received messages identify senders.
 * @param keyOrPrefix At least 12 hex characters
 */
export function publicKeyPrefixToBytes(keyOrPrefix: string): Uint8Array {
  const normalized = keyOrPrefix.toLowerCase();
  const size = PUB_KEY_PREFIX_SIZE * 2;
  if (normalized.length < size || !/^[0-9a-f]+$/.test(normalized)) {
    throw new RangeError(`public key prefix must be at least ${size} hex characters, got "${keyOrPrefix}"`);
  }
  return fromHex(normalized.slice(0, size));
}
