import { utf8ByteLength } from '@meshcorejs/protocol';
import { MessageTooLongError } from '../errors.js';
import { DM_TEXT_BUDGET, truncateText, wrapLine } from '../messages/text.js';

export type OverflowMode = 'error' | 'truncate' | 'split';

export const DEFAULT_MAX_PARTS = 3;

type Entry = { kind: 'line'; text: string } | { kind: 'field'; name: string; value: string };

export class MessageBuilder {
  #title: string | null = null;
  #footer: string | null = null;
  readonly #entries: Entry[] = [];
  #overflow: OverflowMode = 'error';
  #maxParts = DEFAULT_MAX_PARTS;

  /** @param text First line */
  setTitle(text: string): this {
    this.#title = text;
    return this;
  }

  /** @param text One line */
  addLine(text: string): this {
    this.#entries.push({ kind: 'line', text });
    return this;
  }

  /** @param texts One line each */
  addLines(texts: Iterable<string>): this {
    for (const text of texts) this.addLine(text);
    return this;
  }

  /**
   * @param name Field label
   * @param value Field value
   */
  addField(name: string, value: string): this {
    this.#entries.push({ kind: 'field', name, value });
    return this;
  }

  /** @param text Last line */
  setFooter(text: string): this {
    this.#footer = text;
    return this;
  }

  /**
   * @param mode error, truncate or split when the text exceeds the budget
   * @param options maxParts for split. Default 3
   */
  setOverflow(mode: OverflowMode, options: { maxParts?: number } = {}): this {
    const maxParts = options.maxParts ?? DEFAULT_MAX_PARTS;
    if (!Number.isInteger(maxParts) || maxParts < 1) throw new RangeError('maxParts must be a positive integer');
    this.#overflow = mode;
    this.#maxParts = maxParts;
    return this;
  }

  get overflow(): OverflowMode {
    return this.#overflow;
  }

  /** @param budget Budget in UTF-8 bytes. Default the DM budget */
  measure(budget: number = DM_TEXT_BUDGET): { bytes: number; limit: number; parts: number } {
    const bytes = utf8ByteLength(this.#lines(budget).join('\n'));
    let parts = 1;
    if (bytes > budget && this.#overflow === 'split') parts = this.build(budget).length;
    return { bytes, limit: budget, parts };
  }

  /** @param budget Budget in UTF-8 bytes */
  build(budget: number): string[] {
    if (budget < 16) throw new RangeError(`budget of ${budget} bytes is too small`);
    const lines = this.#lines(budget);
    const text = lines.join('\n');
    if (text === '') throw new RangeError('cannot send an empty message');
    const bytes = utf8ByteLength(text);
    if (bytes <= budget) return [text];

    switch (this.#overflow) {
      case 'error':
        throw new MessageTooLongError(bytes, budget);
      case 'truncate':
        return [truncateText(text, budget)];
      case 'split':
        return splitIntoParts(lines, budget, this.#maxParts);
    }
  }

  toString(): string {
    return this.#lines(Number.POSITIVE_INFINITY).join('\n');
  }

  #lines(budget: number): string[] {
    const lines: string[] = [];
    if (this.#title !== null) lines.push(this.#title);
    let fields: string[] = [];
    const flushFields = () => {
      if (fields.length === 0) return;
      const joined = fields.join(' | ');
      if (utf8ByteLength(joined) <= budget) lines.push(joined);
      else lines.push(...fields);
      fields = [];
    };
    for (const entry of this.#entries) {
      if (entry.kind === 'field') {
        fields.push(`${entry.name}: ${entry.value}`);
        continue;
      }
      flushFields();
      lines.push(entry.text);
    }
    flushFields();
    if (this.#footer !== null) lines.push(this.#footer);
    return lines;
  }
}

const suffix = (index: number, total: number) => ` ${index}/${total}`;

function pack(lines: string[], capacity: number): string[] {
  const parts: string[] = [];
  let current: string | null = null;
  for (const line of lines) {
    const pieces = utf8ByteLength(line) > capacity ? wrapLine(line, capacity) : [line];
    for (const piece of pieces) {
      const candidate: string = current === null ? piece : `${current}\n${piece}`;
      if (utf8ByteLength(candidate) <= capacity) {
        current = candidate;
      } else {
        if (current !== null) parts.push(current);
        current = piece;
      }
    }
  }
  if (current !== null) parts.push(current);
  return parts;
}

function splitIntoParts(lines: string[], budget: number, maxParts: number): string[] {
  let total = 2;
  let parts = pack(lines, budget - utf8ByteLength(suffix(total, total)));
  while (parts.length > total && total < maxParts) {
    total = Math.min(parts.length, maxParts);
    parts = pack(lines, budget - utf8ByteLength(suffix(total, total)));
  }
  if (parts.length > maxParts) {
    const capacity = budget - utf8ByteLength(suffix(maxParts, maxParts));
    parts = [...parts.slice(0, maxParts - 1), truncateText(parts.slice(maxParts - 1).join('\n'), capacity)];
  }
  const count = parts.length;
  if (count === 1) return parts;
  return parts.map((part, i) => `${part}${suffix(i + 1, count)}`);
}
