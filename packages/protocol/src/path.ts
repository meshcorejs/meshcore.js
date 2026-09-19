import { MAX_PATH_SIZE, OUT_PATH_UNKNOWN } from './constants.js';

export interface Path {
  hashSize: 1 | 2 | 3;
  hops: Uint8Array[];
}

export interface PathLength {
  hashSize: 1 | 2 | 3;
  hopCount: number;
  byteLength: number;
}

/** @param pathLen Wire path length byte */
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

/** @param path Path bytes, or null for flood */
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
