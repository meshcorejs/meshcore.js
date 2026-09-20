import { describe, expect, it } from 'vitest';
import { History } from '../src/history.js';

describe('History', () => {
  it('returns nothing for an unknown key', () => {
    expect(new History(6, 600_000).get('a')).toEqual([]);
  });

  it('keeps the last max exchanges (two turns each)', () => {
    const history = new History(2, 600_000);
    history.push('a', { role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' });
    history.push('a', { role: 'user', content: 'q2' }, { role: 'assistant', content: 'a2' });
    history.push('a', { role: 'user', content: 'q3' }, { role: 'assistant', content: 'a3' });
    expect(history.get('a').map((turn) => turn.content)).toEqual(['q2', 'a2', 'q3', 'a3']);
  });

  it('expires after the ttl and refreshes it on push', () => {
    let now = 1_000;
    const history = new History(6, 600_000, () => now);
    history.push('a', { role: 'user', content: 'q1' });
    now += 599_000;
    expect(history.get('a')).toHaveLength(1);
    history.push('a', { role: 'assistant', content: 'a1' });
    now += 599_000;
    expect(history.get('a')).toHaveLength(2);
    now += 2_000;
    expect(history.get('a')).toEqual([]);
  });

  it('stores nothing when max is 0', () => {
    const history = new History(0, 600_000);
    history.push('a', { role: 'user', content: 'q' });
    expect(history.get('a')).toEqual([]);
  });

  it('hands out a copy, so the caller cannot alter what is kept', () => {
    const history = new History(6, 600_000);
    history.push('a', { role: 'user', content: 'q' });
    history.get('a').push({ role: 'assistant', content: 'stray' });
    expect(history.get('a')).toEqual([{ role: 'user', content: 'q' }]);
  });

  it('keeps keys independent', () => {
    const history = new History(6, 600_000);
    history.push('a', { role: 'user', content: 'q' });
    expect(history.get('b')).toEqual([]);
  });
});
