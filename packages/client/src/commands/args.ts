import type { Role } from '../permissions/role.js';
import type { Channel } from '../structures/channel.js';
import type { Contact } from '../structures/contact.js';

export type ArgType = 'string' | 'integer' | 'number' | 'boolean' | 'choice' | 'contact' | 'channel' | 'role';

export type ArgValue<T extends ArgType, C extends string = string> = T extends 'string'
  ? string
  : T extends 'integer' | 'number'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'choice'
        ? C
        : T extends 'contact'
          ? Contact
          : T extends 'channel'
            ? Channel
            : T extends 'role'
              ? Role
              : never;

export interface ArgDefinition {
  type: ArgType;
  name: string;
  description: string;
  required: boolean;
  hasDefault: boolean;
  defaultValue: unknown;
  minLength: number | null;
  maxLength: number | null;
  pattern: RegExp | null;
  rest: boolean;
  min: number | null;
  max: number | null;
  choices: string[];
}

export const ARG_NAME_PATTERN = /^[a-z0-9_]{1,32}$/;

export class ArgBuilder<
  T extends ArgType,
  N extends string = string,
  R extends boolean = false,
  C extends string = string,
> {
  readonly #data: ArgDefinition;

  /** @param type Argument type */
  constructor(type: T) {
    this.#data = {
      type,
      name: '',
      description: '',
      required: false,
      hasDefault: false,
      defaultValue: undefined,
      minLength: null,
      maxLength: null,
      pattern: null,
      rest: false,
      min: null,
      max: null,
      choices: [],
    };
  }

  /** @param name Lowercase, letters digits and _, 1 to 32 characters */
  setName<const N2 extends string>(name: N2): ArgBuilder<T, N2, R, C> {
    this.#data.name = name;
    return this as unknown as ArgBuilder<T, N2, R, C>;
  }

  /** @param description Free text for the bot author */
  setDescription(description: string): this {
    this.#data.description = description;
    return this;
  }

  /** @param required Default true */
  setRequired<const R2 extends boolean = true>(required: R2 = true as R2): ArgBuilder<T, N, R2, C> {
    this.#data.required = required;
    return this as unknown as ArgBuilder<T, N, R2, C>;
  }

  /** @param value Used when the argument is omitted, makes it optional */
  setDefault(value: ArgValue<T, C>): ArgBuilder<T, N, true, C> {
    this.#data.hasDefault = true;
    this.#data.defaultValue = value;
    return this as unknown as ArgBuilder<T, N, true, C>;
  }

  /** @param length Minimum length in characters */
  setMinLength(this: ArgBuilder<'string', N, R, C>, length: number): ArgBuilder<'string', N, R, C> {
    this.#data.minLength = length;
    return this;
  }

  /** @param length Maximum length in characters */
  setMaxLength(this: ArgBuilder<'string', N, R, C>, length: number): ArgBuilder<'string', N, R, C> {
    this.#data.maxLength = length;
    return this;
  }

  /** @param pattern Regular expression the value must match */
  setPattern(this: ArgBuilder<'string', N, R, C>, pattern: RegExp): ArgBuilder<'string', N, R, C> {
    this.#data.pattern = pattern;
    return this;
  }

  /** @param rest Take the rest of the line. Only for the last argument */
  setRest(this: ArgBuilder<'string', N, R, C>, rest = true): ArgBuilder<'string', N, R, C> {
    this.#data.rest = rest;
    return this;
  }

  /** @param min Minimum value */
  setMin(this: ArgBuilder<'integer' | 'number', N, R, C>, min: number): ArgBuilder<T, N, R, C> {
    this.#data.min = min;
    return this as unknown as ArgBuilder<T, N, R, C>;
  }

  /** @param max Maximum value */
  setMax(this: ArgBuilder<'integer' | 'number', N, R, C>, max: number): ArgBuilder<T, N, R, C> {
    this.#data.max = max;
    return this as unknown as ArgBuilder<T, N, R, C>;
  }

  /** @param choices Accepted values */
  setChoices<const C2 extends string>(
    this: ArgBuilder<'choice', N, R, C>,
    ...choices: C2[]
  ): ArgBuilder<'choice', N, R, C2> {
    this.#data.choices = choices;
    return this as unknown as ArgBuilder<'choice', N, R, C2>;
  }

  build(): { definition: ArgDefinition; problems: string[] } {
    const data = { ...this.#data, choices: [...this.#data.choices] };
    const problems: string[] = [];
    const label = data.name === '' ? `${data.type} argument` : `argument "${data.name}"`;
    if (!ARG_NAME_PATTERN.test(data.name)) problems.push(`${label}: name must match ${ARG_NAME_PATTERN}`);
    if (data.type === 'choice' && data.choices.length === 0) problems.push(`${label}: setChoices() is required`);
    if (data.min !== null && data.max !== null && data.min > data.max)
      problems.push(`${label}: min is greater than max`);
    if (data.minLength !== null && data.maxLength !== null && data.minLength > data.maxLength) {
      problems.push(`${label}: minLength is greater than maxLength`);
    }
    return { definition: data, problems };
  }
}
