import type { Client } from '../client/client.js';
import type { ArgDefinition } from './args.js';
import { tokenize } from './tokenize.js';

export class ArgumentError extends Error {
  readonly arg: ArgDefinition | null;
  readonly reason: 'missing' | 'invalid' | 'ambiguous' | 'tooMany';

  /**
   * @param reason missing, invalid or tooMany
   * @param arg Argument concerned, or null
   * @param detail Human readable detail
   */
  constructor(reason: ArgumentError['reason'], arg: ArgDefinition | null, detail: string) {
    super(detail);
    this.name = 'ArgumentError';
    this.reason = reason;
    this.arg = arg;
  }
}

const BOOLEANS: Record<string, boolean> = {
  oui: true,
  non: false,
  on: true,
  off: false,
  true: true,
  false: false,
  '1': true,
  '0': false,
};

export function parseArgs(client: Client, args: readonly ArgDefinition[], input: string): Record<string, unknown> {
  const tokens = tokenize(input);
  const result: Record<string, unknown> = {};
  let position = 0;

  for (const arg of args) {
    const token = tokens[position];
    if (!token) {
      if (arg.required) throw new ArgumentError('missing', arg, `missing argument "${arg.name}"`);
      result[arg.name] = arg.hasDefault ? arg.defaultValue : undefined;
      continue;
    }
    if (arg.rest) {
      const raw = input.slice(token.start).trim();
      result[arg.name] = parseValue(client, arg, tokens.length - position === 1 ? token.value : raw);
      position = tokens.length;
      continue;
    }
    result[arg.name] = parseValue(client, arg, token.value);
    position++;
  }

  if (position < tokens.length) throw new ArgumentError('tooMany', null, 'too many arguments');
  return result;
}

function parseValue(client: Client, arg: ArgDefinition, raw: string): unknown {
  const invalid = (detail: string) => new ArgumentError('invalid', arg, `argument "${arg.name}": ${detail}`);
  switch (arg.type) {
    case 'string': {
      const length = [...raw].length;
      if (arg.minLength !== null && length < arg.minLength) throw invalid(`shorter than ${arg.minLength}`);
      if (arg.maxLength !== null && length > arg.maxLength) throw invalid(`longer than ${arg.maxLength}`);
      if (arg.pattern && !new RegExp(arg.pattern.source, arg.pattern.flags.replace('g', '')).test(raw)) {
        throw invalid(`does not match ${arg.pattern}`);
      }
      return raw;
    }
    case 'integer':
    case 'number': {
      const normalized = raw.replace(',', '.');
      const valid = arg.type === 'integer' ? /^[+-]?\d+$/.test(raw) : /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(normalized);
      if (!valid) throw invalid(`not ${arg.type === 'integer' ? 'an integer' : 'a number'}`);
      const value = Number(normalized);
      if (arg.min !== null && value < arg.min) throw invalid(`below ${arg.min}`);
      if (arg.max !== null && value > arg.max) throw invalid(`above ${arg.max}`);
      return value;
    }
    case 'boolean': {
      const value = BOOLEANS[raw.toLowerCase()];
      if (value === undefined) throw invalid('not a boolean');
      return value;
    }
    case 'choice': {
      const choice = arg.choices.find((c) => c.toLowerCase() === raw.toLowerCase());
      if (choice === undefined) throw invalid(`expected one of ${arg.choices.join(', ')}`);
      return choice;
    }
    case 'contact': {
      const lower = raw.toLowerCase();
      const byName = client.contacts.cache.filter((c) => c.name.toLowerCase() === lower);
      if (byName.size === 1) return byName.first();
      if (byName.size > 1) throw new ArgumentError('ambiguous', arg, `several contacts are named "${raw}"`);
      const byPrefix = client.contacts.cache.filter((c) => c.name.toLowerCase().startsWith(lower));
      if (byPrefix.size === 1) return byPrefix.first();
      if (byPrefix.size > 1) throw new ArgumentError('ambiguous', arg, `several contacts start with "${raw}"`);
      const byKey = client.contacts.get(raw);
      if (byKey) return byKey;
      throw invalid(`unknown contact "${raw}"`);
    }
    case 'role': {
      const role = client.roles.get(raw);
      if (!role) throw invalid(`unknown role "${raw}"`);
      return role;
    }
    case 'channel': {
      const channel = /^\d+$/.test(raw) ? client.channels.get(Number(raw)) : client.channels.get(raw);
      if (!channel) throw invalid(`unknown channel "${raw}"`);
      return channel;
    }
  }
}
