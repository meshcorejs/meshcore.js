import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandBuilder } from '../src/commands/command-builder.js';
import { ClientStateError, LoadError } from '../src/errors.js';
import { JobBuilder } from '../src/jobs/job-builder.js';
import { PluginBuilder } from '../src/plugins/plugin-builder.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-18T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const ping = () => new CommandBuilder().setName('ping').setHandler((ctx) => ctx.reply('pong'));

describe('Plugin lifecycle before login', () => {
  it('registers as pending and is loaded by login(), bricks entering the managers', async () => {
    const { client } = await setupClient({ login: false });
    const faq = new PluginBuilder().setName('faq').addBricks(
      ping(),
      new JobBuilder()
        .setName('tick')
        .setInterval(60)
        .setHandler(() => undefined),
    );
    client.register(faq);
    const plugin = client.plugins.get(faq);
    expect(plugin.state).toBe('pending');
    expect(plugin.loaded).toBe(false);
    expect(client.commands.get('ping')).toBeUndefined();

    const onLoad = vi.fn();
    client.on('pluginLoad', onLoad);
    await client.login();
    expect(plugin.loaded).toBe(true);
    expect(plugin.bricks).toHaveLength(2);
    expect(client.commands.get('ping')).toBeDefined();
    expect(client.jobs.get('tick')).toBeDefined();
    expect(onLoad).toHaveBeenCalledWith(plugin);
    expect(client.plugins.get('faq')).toBe(plugin);
    expect(client.plugins.size).toBe(1);
  });

  it('passes the options of configure() to the async bricks factory', async () => {
    const { client, radio } = await setupClient({ login: false });
    const calls: string[] = [];
    interface Options {
      greeting: string;
    }
    const hello = new PluginBuilder<Options>().setName('hello').setBricks(async (_client, options) => {
      calls.push(`bricks:${options.greeting}`);
      return [new CommandBuilder().setName('hello').setHandler((ctx) => ctx.reply(options.greeting))];
    });
    const configured = hello.configure({ greeting: 'hi' });
    client.register(configured);
    await client.login();
    expect(calls).toEqual(['bricks:hi']);
    expect(client.plugins.get(configured).loaded).toBe(true);
    expect(client.plugins.get(configured)).toBe(client.plugins.get('hello'));
    expect(radio.sent).toEqual([]);
  });

  it('fails login with a prefixed LoadError when a brick of the plugin is invalid', async () => {
    const { client } = await setupClient({ login: false });
    client.register(
      new PluginBuilder().setName('bad').setBricks(() => [new CommandBuilder().setName('Nope!').setHandler(() => 1)]),
    );
    const error = await client.login().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LoadError);
    expect((error as LoadError).issues[0]).toMatchObject({ brick: 'bad › command "nope!"' });
  });

  it('turns a throwing factory into a LoadError, hinting at configure() when unconfigured', async () => {
    const { client } = await setupClient({ login: false });
    interface Options {
      city: string;
    }
    const meteo = new PluginBuilder<Options>()
      .setName('meteo')
      .setBricks((_c, options) => [new CommandBuilder().setName(options.city).setHandler(() => 1)]);
    client.register(meteo); // deliberately unconfigured: a type-level Brick, refused at load
    const error = await client.login().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LoadError);
    expect((error as LoadError).issues[0]?.brick).toBe('meteo › options');
    expect((error as LoadError).issues[0]?.message).toMatch(/configure\(\) is missing/);
  });

  it('rejects a plugin returning a plugin or a non-brick', async () => {
    const { client } = await setupClient({ login: false });
    const inner = new PluginBuilder().setName('inner').addBricks(ping());
    client.register(new PluginBuilder().setName('outer').setBricks(() => [inner, 42 as never]));
    const error = await client.login().catch((e: unknown) => e);
    expect((error as LoadError).issues.map((i) => `${i.brick} › ${i.message}`)).toEqual([
      'outer › bricks[0] › a plugin cannot contain a plugin',
      'outer › bricks[1] › is not a meshcore.js builder',
    ]);
  });

  it('reports duplicate plugin names at login', async () => {
    const { client } = await setupClient({ login: false });
    client.register([
      new PluginBuilder().setName('dup').addBricks(ping()),
      new PluginBuilder().setName('dup').setBricks(() => []),
    ]);
    await expect(client.login()).rejects.toMatchObject({
      issues: [{ brick: 'plugin "dup"', message: 'duplicate plugin name' }],
    });
  });

  it('get(builder) throws for an unregistered builder', async () => {
    const { client } = await setupClient({ login: false });
    const faq = new PluginBuilder().setName('faq').addBricks(ping());
    expect(() => client.plugins.get(faq)).toThrow(ClientStateError);
    client.register(faq);
    expect(client.plugins.get(faq).state).toBe('pending');
  });
});

describe('Plugin lifecycle after ready', () => {
  it('unload removes the bricks and stops the jobs; load brings them back', async () => {
    const { client, radio } = await setupClient();
    const runs = vi.fn();
    const plugin = new PluginBuilder()
      .setName('faq')
      .addBricks(ping(), new JobBuilder().setName('tick').setInterval(10).setHandler(runs));
    client.register(plugin);
    await flush();
    const faq = client.plugins.get(plugin);
    expect(faq.loaded).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs).toHaveBeenCalledTimes(1);

    const onUnload = vi.fn();
    client.on('pluginUnload', onUnload);
    await faq.unload();
    expect(faq.state).toBe('unloaded');
    expect(client.commands.get('ping')).toBeUndefined();
    expect(client.jobs.get('tick')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(runs).toHaveBeenCalledTimes(1);
    expect(onUnload).toHaveBeenCalledWith(faq);
    await expect(faq.unload()).rejects.toThrow(ClientStateError);

    await faq.load();
    expect(client.commands.get('ping')).toBeDefined();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs).toHaveBeenCalledTimes(2);
    await expect(faq.load()).rejects.toThrow(ClientStateError);
    expect(radio.sent).toEqual([]);
  });

  it('reload re-runs the factory; a failing reload restores the previous bricks and rethrows', async () => {
    const { client } = await setupClient();
    let version = 1;
    const plugin = new PluginBuilder().setName('faq').setBricks(() => {
      if (version === 3) throw new Error('boom');
      return [new CommandBuilder().setName(`cmd${version}`).setHandler(() => 1)];
    });
    client.register(plugin);
    await flush();
    const faq = client.plugins.get(plugin);
    expect(client.commands.get('cmd1')).toBeDefined();

    version = 2;
    await faq.reload();
    expect(client.commands.get('cmd1')).toBeUndefined();
    expect(client.commands.get('cmd2')).toBeDefined();

    version = 3;
    await expect(faq.reload()).rejects.toMatchObject({ issues: [{ brick: 'faq › bricks', message: 'boom' }] });
    expect(faq.loaded).toBe(true);
    expect(client.commands.get('cmd2')).toBeDefined();
  });

  it('a load that breaks global validation registers nothing', async () => {
    const { client } = await setupClient();
    client.register(ping());
    const clash = new PluginBuilder().setName('clash').addBricks(ping());
    client.register(clash);
    await flush();
    expect(client.plugins.get(clash).loaded).toBe(false);
    expect(client.commands.cache.filter((c) => !c.core).size).toBe(1);
    await expect(client.plugins.get(clash).load()).rejects.toBeInstanceOf(LoadError);
  });

  it('reports a plugin that fails to load from register() through error with source plugin', async () => {
    const { client } = await setupClient();
    const onError = vi.fn();
    client.on('error', onError);
    client.register(
      new PluginBuilder().setName('broken').setBricks(() => {
        throw new Error('no key');
      }),
    );
    await flush();
    expect(onError).toHaveBeenCalledOnce();
    const [error, source] = onError.mock.calls[0] as [Error, { type: string; name?: string }];
    expect(error).toBeInstanceOf(LoadError);
    expect(source).toEqual({ type: 'plugin', name: 'broken' });
    expect(client.plugins.get('broken')?.state).toBe('pending');
  });
});
