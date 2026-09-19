import { utf8ByteLength } from '@meshcorejs/protocol';
import { describe, expect, it } from 'vitest';
import {
  channelTextBudget,
  cutToBytes,
  DM_TEXT_BUDGET,
  graphemes,
  mentionPrefix,
  truncateText,
  wrapLine,
} from '../src/messages/text.js';

describe('budgets', () => {
  it('DM budget is 158 bytes', () => {
    expect(DM_TEXT_BUDGET).toBe(158);
  });

  it('channel budget removes "<name>: " and the mention', () => {
    expect(channelTextBudget('TrainBot')).toBe(150);
    expect(channelTextBudget('TrainBot', mentionPrefix('Léa'))).toBe(150 - utf8ByteLength('@[Léa] '));
    expect(mentionPrefix('Léa')).toBe('@[Léa] ');
  });
});

describe('graphemes and cutting', () => {
  it('keeps emoji sequences whole', () => {
    expect(graphemes('a👨‍👩‍👧b')).toEqual(['a', '👨‍👩‍👧', 'b']);
    expect(cutToBytes('a👨‍👩‍👧b', 10)).toBe('a');
    expect(cutToBytes('éé', 3)).toBe('é');
  });
});

describe('truncateText', () => {
  it('leaves fitting text untouched', () => {
    expect(truncateText('hello', 5)).toBe('hello');
  });

  it('prefers the last line break, then the last space', () => {
    expect(truncateText('line one\nline two is long', 20)).toBe('line one…');
    expect(truncateText('alpha beta gamma delta', 16)).toBe('alpha beta…');
  });

  it('falls back to a grapheme boundary and never exceeds the budget', () => {
    const result = truncateText('🚆🚆🚆🚆🚆', 12);
    expect(result).toBe('🚆🚆…');
    expect(utf8ByteLength(result)).toBeLessThanOrEqual(12);
  });
});

describe('wrapLine', () => {
  it('wraps between words', () => {
    expect(wrapLine('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });

  it('cuts words longer than the budget', () => {
    expect(wrapLine('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
});
