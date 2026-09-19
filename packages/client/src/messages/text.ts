import { MAX_TEXT_LEN, utf8ByteLength } from '@meshcorejs/protocol';

export const DM_TEXT_BUDGET = MAX_TEXT_LEN - 2;

/**
 * @param selfName Name of this radio
 * @param mention Mention prefix counted in the budget
 */
export function channelTextBudget(selfName: string, mention = ''): number {
  return MAX_TEXT_LEN - utf8ByteLength(`${selfName}: `) - utf8ByteLength(mention);
}

export function mentionPrefix(name: string): string {
  return `@[${name}] `;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (segment) => segment.segment);
}

export function cutToBytes(text: string, maxBytes: number): string {
  let result = '';
  let bytes = 0;
  for (const grapheme of graphemes(text)) {
    const size = utf8ByteLength(grapheme);
    if (bytes + size > maxBytes) break;
    result += grapheme;
    bytes += size;
  }
  return result;
}

const ELLIPSIS = '…';

export function truncateText(text: string, maxBytes: number): string {
  if (utf8ByteLength(text) <= maxBytes) return text;
  const room = maxBytes - utf8ByteLength(ELLIPSIS);
  if (room <= 0) return cutToBytes(ELLIPSIS, maxBytes);
  const candidate = cutToBytes(text, room);
  const lineBreak = candidate.lastIndexOf('\n');
  const space = candidate.lastIndexOf(' ');
  const cut = lineBreak > 0 ? candidate.slice(0, lineBreak) : space > 0 ? candidate.slice(0, space) : candidate;
  return `${cut.trimEnd()}${ELLIPSIS}`;
}

export function wrapLine(line: string, maxBytes: number): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const word of line.split(' ')) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (utf8ByteLength(candidate) <= maxBytes) {
      current = candidate;
      continue;
    }
    if (current !== '') pieces.push(current);
    let rest = word;
    while (utf8ByteLength(rest) > maxBytes) {
      const head = cutToBytes(rest, maxBytes);
      if (head === '') break;
      pieces.push(head);
      rest = rest.slice(head.length);
    }
    current = rest;
  }
  if (current !== '') pieces.push(current);
  return pieces;
}
