import { describe, expect, it } from 'vitest';
import { CommandBuilder } from '../src/commands/command-builder.js';
import { LoadError } from '../src/errors.js';
import { JobBuilder } from '../src/jobs/job-builder.js';
import { PluginBuilder } from '../src/plugins/plugin-builder.js';

function issues(builder: { build(): unknown }): string[] {
  try {
    builder.build();
    return [];
  } catch (error) {
    if (!(error instanceof LoadError)) throw error;
    return error.issues.map((issue) => `${issue.brick} › ${issue.message}`);
  }
}

const ping = new CommandBuilder().setName('ping').setHandler((ctx) => ctx.reply('pong'));
const tick = new JobBuilder()
  .setName('tick')
  .setInterval(60)
  .setHandler(() => undefined);

describe('PluginBuilder', () => {
  it('requires a valid name and at least an API or bricks', () => {
    expect(issues(new PluginBuilder())).toEqual([
      'plugin "?" › name must match /^[a-z0-9_-]{1,32}$/',
      'plugin "?" › setBricks() or addBricks() is required',
    ]);
    expect(issues(new PluginBuilder().setName('Faq!').addBricks(ping))).toEqual([
      'plugin "Faq!" › name must match /^[a-z0-9_-]{1,32}$/',
    ]);
  });

  it('refuses both a static list and a factory, and nested plugins', () => {
    const nested = new PluginBuilder().setName('inner').addBricks(ping);
    expect(
      issues(
        new PluginBuilder()
          .setName('outer')
          .addBricks(nested)
          .setBricks(() => [ping]),
      ),
    ).toEqual([
      'plugin "outer" › use either setBricks() or addBricks(), not both',
      'plugin "outer" › a plugin cannot contain a plugin',
    ]);
    expect(issues(new PluginBuilder().setName('x').addBricks({} as never))).toEqual([
      'plugin "x" › addBricks() only accepts meshcore.js builders',
    ]);
  });

  it('builds a frozen definition; a static list becomes a constant factory', async () => {
    const definition = new PluginBuilder().setName('faq').setDescription('FAQ').addBricks(ping, tick).build();
    expect(definition.name).toBe('faq');
    expect(definition.description).toBe('FAQ');
    expect(definition.configured).toBe(false);
    expect(definition.options).toBeUndefined();
    expect([...(await definition.bricks({} as never, undefined))]).toEqual([ping, tick]);
    expect(Object.isFrozen(definition)).toBe(true);
  });

  it('keeps the factory deferred', () => {
    const bricks = () => [ping];
    const definition = new PluginBuilder().setName('ai').setBricks(bricks).build();
    expect(definition.bricks).toBe(bricks);
  });

  it('configure() returns a configured copy and leaves the original untouched', () => {
    interface Options {
      city: string;
      channel?: string;
    }
    const meteo = new PluginBuilder<Options>()
      .setName('meteo')
      .setBricks((_client, options) => [
        new CommandBuilder().setName('meteo').setHandler((ctx) => ctx.reply(options.city)),
      ]);
    const toulouse = meteo.configure({ city: 'Toulouse' });
    expect(toulouse).not.toBe(meteo);
    expect(toulouse.build().options).toEqual({ city: 'Toulouse' });
    expect(toulouse.build().configured).toBe(true);
    expect(meteo.build().configured).toBe(false);
    expect(toulouse.setName('meteo-tls').build().name).toBe('meteo-tls');
    expect(meteo.build().name).toBe('meteo');
  });

  it('has no configure() when Options is void', () => {
    const plain = new PluginBuilder().setName('plain').addBricks(ping);
    // @ts-expect-error configure() is not available without an Options type
    plain.configure(undefined);
  });
});
