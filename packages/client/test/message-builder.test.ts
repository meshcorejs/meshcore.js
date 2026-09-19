import { utf8ByteLength } from '@meshcorejs/protocol';
import { describe, expect, it } from 'vitest';
import { MessageBuilder } from '../src/builders/message-builder.js';
import { MessageTooLongError } from '../src/errors.js';

describe('MessageBuilder rendering', () => {
  it('renders title, lines, grouped fields and footer', () => {
    const message = new MessageBuilder()
      .setTitle('🚆 6607')
      .addLine('Lyon Part-Dieu → Paris Gare de Lyon')
      .addField('Départ', '14:32')
      .addField('Voie', 'H')
      .addLine('⚠️ +12min')
      .setFooter('màj 14:20');
    expect(message.build(158)).toEqual([
      '🚆 6607\nLyon Part-Dieu → Paris Gare de Lyon\nDépart: 14:32 | Voie: H\n⚠️ +12min\nmàj 14:20',
    ]);
    expect(message.toString()).toBe(message.build(158)[0]);
  });

  it('puts fields on separate lines when the joined line does not fit', () => {
    expect(new MessageBuilder().addField('A', '1').addField('B', '2').build(158)).toEqual(['A: 1 | B: 2']);
    expect(
      new MessageBuilder().addField('A', 'x'.repeat(20)).addField('B', 'y'.repeat(20)).setOverflow('split').build(30),
    ).toEqual([`A: ${'x'.repeat(20)} 1/2`, `B: ${'y'.repeat(20)} 2/2`]);
  });

  it('rejects empty messages and tiny budgets', () => {
    expect(() => new MessageBuilder().build(158)).toThrow('cannot send an empty message');
    expect(() => new MessageBuilder().addLine('x').build(4)).toThrow(RangeError);
  });
});

describe('overflow modes', () => {
  const long = () =>
    new MessageBuilder()
      .setTitle('🚉 Lyon Part-Dieu')
      .addLines(Array.from({ length: 12 }, (_, i) => `1${i}:00 Paris Gare de Lyon (ok)`));

  it("'error' (default) throws MessageTooLongError with size and limit", () => {
    const message = long();
    expect(message.overflow).toBe('error');
    try {
      message.build(158);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MessageTooLongError);
      expect(error).toMatchObject({ limit: 158, bytes: utf8ByteLength(message.toString()) });
    }
  });

  it("'truncate' cuts at a line break and adds an ellipsis", () => {
    const [text] = long().setOverflow('truncate').build(100);
    expect(text).toBe('🚉 Lyon Part-Dieu\n10:00 Paris Gare de Lyon (ok)\n11:00 Paris Gare de Lyon (ok)…');
    expect(utf8ByteLength(text!)).toBeLessThanOrEqual(100);
  });

  it("'split' numbers the parts and keeps each one within the budget", () => {
    const parts = long().setOverflow('split', { maxParts: 5 }).build(158);
    expect(parts).toHaveLength(3);
    parts.forEach((part, i) => {
      expect(part.endsWith(` ${i + 1}/3`)).toBe(true);
      expect(utf8ByteLength(part)).toBeLessThanOrEqual(158);
    });
    expect(parts[0]!.startsWith('🚉 Lyon Part-Dieu\n10:00')).toBe(true);
  });

  it("'split' truncates the last allowed part beyond maxParts", () => {
    const parts = long().setOverflow('split', { maxParts: 2 }).build(158);
    expect(parts).toHaveLength(2);
    expect(parts[1]!.endsWith('… 2/2')).toBe(true);
    expect(utf8ByteLength(parts[1]!)).toBeLessThanOrEqual(158);
  });

  it("'split' keeps the footer in the last part only", () => {
    const parts = long().setFooter('màj 14:20').setOverflow('split', { maxParts: 5 }).build(158);
    expect(parts.at(-1)).toContain('màj 14:20');
    expect(parts.slice(0, -1).some((p) => p.includes('màj'))).toBe(false);
  });

  it("'split' wraps a single line longer than the budget", () => {
    const parts = new MessageBuilder().addLine('mot '.repeat(60).trim()).setOverflow('split').build(100);
    expect(parts.length).toBe(3);
    for (const part of parts) expect(utf8ByteLength(part)).toBeLessThanOrEqual(100);
  });

  it('measure reports bytes, limit and parts', () => {
    expect(new MessageBuilder().addLine('hello').measure()).toEqual({ bytes: 5, limit: 158, parts: 1 });
    expect(long().setOverflow('split', { maxParts: 5 }).measure(158).parts).toBe(3);
  });

  it('rejects invalid maxParts', () => {
    expect(() => new MessageBuilder().setOverflow('split', { maxParts: 0 })).toThrow(RangeError);
  });
});
