import { fromHex, toHex } from './bytes.js';

/** The scheme of a MeshCore contact link. */
export const CONTACT_URI_PREFIX = 'meshcore://';

/**
 * The `meshcore://` link of a node, from its advert packet (what `EXPORT_CONTACT` returns).
 * @param packet Advert packet of the node
 */
export function contactUri(packet: Uint8Array): string {
  return `${CONTACT_URI_PREFIX}${toHex(packet)}`;
}

/**
 * The advert packet inside a `meshcore://` link; throws when the link is not one.
 * @param uri meshcore:// contact link
 */
export function parseContactUri(uri: string): Uint8Array {
  const trimmed = uri.trim();
  if (!trimmed.toLowerCase().startsWith(CONTACT_URI_PREFIX)) {
    throw new RangeError(`contact URI must start with ${CONTACT_URI_PREFIX}, got "${uri}"`);
  }
  return fromHex(trimmed.slice(CONTACT_URI_PREFIX.length));
}
