import { MAX_PATH_SIZE, OUT_PATH_UNKNOWN } from './constants.js';

/** A route through the mesh: the hash size used and one hash per hop. */
export interface Path {
  hashSize: 1 | 2 | 3;
  hops: Uint8Array[];
}

/** The decoded `pathLen` byte of the wire format: hash size, hop count and total byte length. */
export interface PathLength {
  hashSize: 1 | 2 | 3;
  hopCount: number;
  byteLength: number;
}

/**
 * Split a wire `pathLen` byte into hash size and hop count; `null` when the route is unknown.
 * @param pathLen Wire path length byte
 */
export function decodePathLength(pathLen: number): PathLength | null {
  if (pathLen === OUT_PATH_UNKNOWN) return null;
  const hopCount = pathLen & 0x3f;
  const hashSize = (pathLen >> 6) + 1;
  if (hashSize === 4 || hopCount * hashSize > MAX_PATH_SIZE) {
    throw new RangeError(`invalid path length byte 0x${pathLen.toString(16)}`);
  }
  return { hashSize: hashSize as 1 | 2 | 3, hopCount, byteLength: hopCount * hashSize };
}

/**
 * Decode a route from its `pathLen` byte and raw hop bytes; `null` when unknown.
 * @param pathLen Wire path length byte
 * @param raw Path bytes
 */
export function decodePath(pathLen: number, raw: Uint8Array): Path | null {
  const length = decodePathLength(pathLen);
  if (!length) return null;
  const hops: Uint8Array[] = [];
  for (let i = 0; i < length.hopCount; i++) {
    hops.push(raw.slice(i * length.hashSize, (i + 1) * length.hashSize));
  }
  return { hashSize: length.hashSize, hops };
}

/**
 * Encode a route into its `pathLen` byte and hop bytes; `null` encodes as unknown.
 * @param path Path bytes, or null for flood
 */
export function encodePath(path: Path | null): { pathLen: number; bytes: Uint8Array } {
  const bytes = new Uint8Array(MAX_PATH_SIZE);
  if (!path) return { pathLen: OUT_PATH_UNKNOWN, bytes };
  if (path.hops.length > 0x3f || path.hops.length * path.hashSize > MAX_PATH_SIZE) {
    throw new RangeError(`path too long: ${path.hops.length} hops of ${path.hashSize} byte(s)`);
  }
  path.hops.forEach((hop, i) => {
    if (hop.length !== path.hashSize) {
      throw new RangeError(`hop ${i} is ${hop.length} byte(s), expected ${path.hashSize}`);
    }
    bytes.set(hop, i * path.hashSize);
  });
  return { pathLen: ((path.hashSize - 1) << 6) | path.hops.length, bytes };
}
