import { MAX_FRAME_SIZE } from './constants.js';

/** The `'<'` byte opening an app → radio serial/TCP frame. */
export const TO_RADIO_MARKER = 0x3c;
/** The `'>'` byte opening a radio → app serial/TCP frame. */
export const FROM_RADIO_MARKER = 0x3e;

/** Which side sends the frame; selects the marker byte. */
export type FrameDirection = 'toRadio' | 'fromRadio';

function markerFor(direction: FrameDirection): number {
  return direction === 'toRadio' ? TO_RADIO_MARKER : FROM_RADIO_MARKER;
}

/**
 * Wrap a payload in the serial/TCP framing: marker, length (u16 little-endian), payload.
 * @param payload Frame payload
 * @param direction toRadio or fromRadio. Default toRadio
 */
export function encodeFrame(payload: Uint8Array, direction: FrameDirection = 'toRadio'): Uint8Array {
  if (payload.length === 0 || payload.length > MAX_FRAME_SIZE) {
    throw new RangeError(`frame payload must be 1..${MAX_FRAME_SIZE} bytes, got ${payload.length}`);
  }
  const out = new Uint8Array(3 + payload.length);
  out[0] = markerFor(direction);
  out[1] = payload.length & 0xff;
  out[2] = payload.length >>> 8;
  out.set(payload, 3);
  return out;
}

type DecoderState = 'idle' | 'lengthLow' | 'lengthHigh' | 'body';

/** Reassemble serial/TCP frames from a byte stream: feed chunks, get complete payloads; bytes before a marker are skipped. */
export class FrameDecoder {
  readonly #marker: number;
  #state: DecoderState = 'idle';
  #expected = 0;
  #body: number[] = [];

  /** @param direction Marker expected. Default fromRadio */
  constructor(direction: FrameDirection = 'fromRadio') {
    this.#marker = markerFor(direction);
  }

  /** @param chunk Bytes received, any split */
  push(chunk: Uint8Array): Uint8Array[] {
    const frames: Uint8Array[] = [];
    for (const byte of chunk) {
      switch (this.#state) {
        case 'idle':
          if (byte === this.#marker) this.#state = 'lengthLow';
          break;
        case 'lengthLow':
          this.#expected = byte;
          this.#state = 'lengthHigh';
          break;
        case 'lengthHigh':
          this.#expected |= byte << 8;
          if (this.#expected === 0 || this.#expected > MAX_FRAME_SIZE) {
            this.#state = 'idle';
          } else {
            this.#body = [];
            this.#state = 'body';
          }
          break;
        case 'body':
          this.#body.push(byte);
          if (this.#body.length === this.#expected) {
            frames.push(Uint8Array.from(this.#body));
            this.#state = 'idle';
          }
          break;
      }
    }
    return frames;
  }

  reset(): void {
    this.#state = 'idle';
    this.#expected = 0;
    this.#body = [];
  }
}
