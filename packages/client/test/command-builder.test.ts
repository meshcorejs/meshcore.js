import { describe, expect, expectTypeOf, it } from 'vitest';
import { CommandBuilder } from '../src/commands/command-builder.js';
import type { CommandContext } from '../src/commands/context.js';
import { LoadError } from '../src/errors.js';
import type { Channel } from '../src/structures/channel.js';
import type { Contact } from '../src/structures/contact.js';

const handler = () => {};

function issues(builder: CommandBuilder<object>): string[] {
  try {
    builder.build();
    return [];
  } catch (error) {
    if (!(error instanceof LoadError)) throw error;
    return error.issues.map((issue) => issue.message);
  }
}

describe('CommandBuilder typing', () => {
  it('infers ctx.args from the declared arguments', () => {
    new CommandBuilder()
      .setName('demo')
      .addStringArg((a) => a.setName('numero').setRequired(true).setPattern(/^\d+$/))
      .addIntegerArg((a) => a.setName('nombre').setMin(1).setMax(5))
      .addNumberArg((a) => a.setName('seuil').setDefault(1.5))
      .addBooleanArg((a) => a.setName('force'))
      .addChoiceArg((a) => a.setName('moment').setChoices('matin', 'soir').setRequired())
      .addContactArg((a) => a.setName('contact'))
      .addChannelArg((a) => a.setName('canal'))
      .setHandler((ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<
          CommandContext<{
            numero: string;
            nombre: number | undefined;
            seuil: number;
            force: boolean | undefined;
            moment: 'matin' | 'soir';
            contact: Contact | undefined;
            canal: Channel | undefined;
          }>
        >();
      });
  });

  it('only exposes type-specific setters on matching argument types', () => {
    new CommandBuilder().addStringArg((a) => {
      // @ts-expect-error setMin is for numeric arguments
      a.setMin(1);
      return a.setName('x');
    });
    new CommandBuilder().addIntegerArg((a) => {
      // @ts-expect-error setPattern is for string arguments
      a.setPattern(/x/);
      return a.setName('x');
    });
  });
});

describe('CommandBuilder validation', () => {
  it('builds a normalized definition', () => {
    const definition = new CommandBuilder()
      .setName('Train')
      .setDescription('Infos sur un train')
      .addAliases('T')
      .addStringArg((a) => a.setName('numero').setRequired(true))
      .setScope('dm')
      .setCooldown(20)
      .setHandler(handler)
      .build();
    expect(definition).toMatchObject({
      name: 'train',
      aliases: ['t'],
      scopes: ['dm'],
      cooldownSeconds: 20,
      maxAgeSeconds: 300,
      args: [{ type: 'string', name: 'numero', required: true }],
    });
  });

  it('reports every problem at once', () => {
    const builder = new CommandBuilder()
      .setName('Bad Name!')
      .addAliases('help')
      .addIntegerArg((a) => a.setName('nombre').setDefault(3))
      .addStringArg((a) => a.setName('gare').setRequired(true).setRest())
      .addStringArg((a) => a.setName('gare'))
      .addChoiceArg((a) => a.setName('vide'));
    expect(issues(builder)).toEqual([
      'name must match /^[a-z0-9_-]{1,32}$/',
      '"help" is reserved by the built-in commands',
      'setHandler() is required',
      'required argument "gare" after optional argument "nombre"',
      'argument "gare" uses setRest() but is not the last argument',
      'duplicate argument "gare"',
      'argument "vide": setChoices() is required',
    ]);
  });

  it('rejects the reserved help name and invalid numbers', () => {
    expect(issues(new CommandBuilder().setName('help').setHandler(handler))).toContain(
      '"help" is reserved by the built-in commands',
    );
    expect(issues(new CommandBuilder().setName('x').setCooldown(-1).setMaxAge(0).setHandler(handler))).toEqual([
      'cooldown must be >= 0',
      'maxAge must be > 0',
    ]);
    expect(
      issues(
        new CommandBuilder()
          .setName('x')
          .addIntegerArg((a) => a.setName('n').setMin(5).setMax(1))
          .setHandler(handler),
      ),
    ).toEqual(['argument "n": min is greater than max']);
  });
});

describe('reserved names and core commands', () => {
  it('reserves help, plugins and jobs for built-in commands', () => {
    for (const name of ['help', 'plugins', 'jobs']) {
      expect(() =>
        new CommandBuilder()
          .setName(name)
          .setHandler(() => 1)
          .build(),
      ).toThrow(`"${name}" is reserved by the built-in commands`);
      expect(() =>
        new CommandBuilder()
          .setName('x')
          .addAliases(name)
          .setHandler(() => 1)
          .build(),
      ).toThrow(LoadError);
      const core = new CommandBuilder({ core: true })
        .setName(name)
        .setHandler(() => 1)
        .build();
      expect(core.core).toBe(true);
    }
    expect(
      new CommandBuilder()
        .setName('x')
        .setHandler(() => 1)
        .build().core,
    ).toBe(false);
  });
});
