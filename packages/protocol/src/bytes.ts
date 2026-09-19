const utf8Decoder = new TextDecoder('utf-8');
const utf8Encoder = new TextEncoder();

/** @param text Text to measure */
export function utf8ByteLength(text: string): number {
  return utf8Encoder.encode(text).length;
}

/** @param bytes Bytes to print */
export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** @param hex Hex string, spaces allowed */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '').toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) {
    throw new RangeError(`invalid hex string: "${hex}"`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export class ByteReader {
  readonly #bytes: Uint8Array;
  readonly #view: DataView;
  #offset = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return this.#bytes.length - this.#offset;
  }

  #take(count: number): number {
    if (count > this.remaining) {
      throw new RangeError(`needed ${count} byte(s) at offset ${this.#offset}, only ${this.remaining} left`);
    }
    const start = this.#offset;
    this.#offset += count;
    return start;
  }

  u8(): number {
    return this.#view.getUint8(this.#take(1));
  }

  i8(): number {
    return this.#view.getInt8(this.#take(1));
  }

  u16(): number {
    return this.#view.getUint16(this.#take(2), true);
  }

  u32(): number {
    return this.#view.getUint32(this.#take(4), true);
  }

  i32(): number {
    return this.#view.getInt32(this.#take(4), true);
  }

  bytes(count: number): Uint8Array {
    const start = this.#take(count);
    return this.#bytes.slice(start, start + count);
  }

  skip(count: number): void {
    this.#take(count);
  }

  fixedString(size: number): string {
    const raw = this.bytes(size);
    const end = raw.indexOf(0);
    return utf8Decoder.decode(end === -1 ? raw : raw.subarray(0, end));
  }

  restString(): string {
    return utf8Decoder.decode(this.bytes(this.remaining));
  }
}

export class ByteWriter {
  readonly #bytes: number[] = [];

  u8(value: number): this {
    this.#bytes.push(value & 0xff);
    return this;
  }

  u16(value: number): this {
    this.#bytes.push(value & 0xff, (value >>> 8) & 0xff);
    return this;
  }

  u32(value: number): this {
    this.#bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
    return this;
  }

  i32(value: number): this {
    return this.u32(value >>> 0);
  }

  bytes(bytes: Uint8Array): this {
    for (const byte of bytes) this.#bytes.push(byte);
    return this;
  }

  zeros(count: number): this {
    for (let i = 0; i < count; i++) this.#bytes.push(0);
    return this;
  }

  fixedString(text: string, size: number): this {
    const encoded = utf8Encoder.encode(text);
    if (encoded.length >= size) {
      throw new RangeError(`"${text}" is ${encoded.length} bytes, field holds at most ${size - 1}`);
    }
    return this.bytes(encoded).zeros(size - encoded.length);
  }

  string(text: string): this {
    return this.bytes(utf8Encoder.encode(text));
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.#bytes);
  }
}
