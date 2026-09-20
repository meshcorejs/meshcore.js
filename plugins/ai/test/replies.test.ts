import { describe, expect, it } from 'vitest';
import { englishReplies, frenchReplies, mergeReplies } from '../src/replies.js';

describe('replies', () => {
  it('has the same keys in English and French', () => {
    expect(Object.keys(frenchReplies).sort()).toEqual(Object.keys(englishReplies).sort());
  });

  it('merges a partial override over the English defaults', () => {
    const replies = mergeReplies({ empty: 'Ask me' });
    expect(replies.empty).toBe('Ask me');
    expect(replies.unavailable).toBe(englishReplies.unavailable);
  });

  it('accepts a full preset', () => {
    expect(mergeReplies(frenchReplies)).toEqual(frenchReplies);
  });
});
