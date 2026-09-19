import { fromHex, toHex } from './bytes.js';

export const CONTACT_URI_PREFIX = 'meshcore://';

/** @param packet Advert packet of the node */
export function contactUri(packet: Uint8Array): string {
  return `${CONTACT_URI_PREFIX}${toHex(packet)}`;
}

/** @param uri meshcore:// contact link */
export function parseContactUri(uri: string): Uint8Array {
  const trimmed = uri.trim();
  if (!trimmed.toLowerCase().startsWith(CONTACT_URI_PREFIX)) {
    throw new RangeError(`contact URI must start with ${CONTACT_URI_PREFIX}, got "${uri}"`);
  }
  return fromHex(trimmed.slice(CONTACT_URI_PREFIX.length));
}
