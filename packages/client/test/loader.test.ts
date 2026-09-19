import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrickLoader, isBrickFile } from '../src/client/loader.js';
import { LoadError } from '../src/errors.js';
import { setupClient } from './helpers.js';

const fixtures = new URL('./fixtures/', import.meta.url);

describe('isBrickFile', () => {
  it('accepts sources and skips declarations, tests and private files', () => {
    expect(['a.ts', 'a.js', 'a.mjs', 'a.mts'].every(isBrickFile)).toBe(true);
    expect(['a.d.ts', 'a.test.ts', 'a.spec.js', '_a.ts', 'a.json', 'a.js.map'].some(isBrickFile)).toBe(false);
  });
});

describe('client.load', () => {
  it('registers commands and events found recursively', async () => {
    const { client, radio } = await setupClient({ login: false });
    await client.load(new URL('bot/', fixtures));
    expect([...client.commands.cache.keys()]).toEqual(['status', 'ping', 'plugins', 'jobs']);
    expect(client.events.size).toBe(1);

    await client.login();
    radio.hearAdvert(fakeContactRecord({ name: 'Julie' }));
    await vi.waitFor(() => expect(radio.sent.map((m) => m.text)).toEqual(['👋 Bienvenue Julie']));
    await client.destroy();
  });

  it('accepts a module URL or path and loads its directory', async () => {
    const { client } = await setupClient({ login: false });
    await client.load(new URL('bot/main.ts', fixtures)); // the file does not need to exist
    expect(client.commands.get('ping')).toBeDefined();

    const other = await setupClient({ login: false });
    await other.client.load(new URL('bot/index.mjs', fixtures).pathname);
    expect(other.client.commands.get('ping')).toBeDefined();
  });

  it('scans plugins/ last and loads the plugin at login', async () => {
    const julie = fakeContactRecord({ name: 'Julie' });
    const { client, radio } = await setupClient({ login: false, contacts: [julie] });
    await client.load(new URL('plugins-bot/', fixtures));
    expect(client.plugins.get('faq')?.state).toBe('pending');
    await client.login();
    expect(client.plugins.get('faq')?.loaded).toBe(true);
    expect([...client.commands.cache.keys()]).toEqual(['ping', 'horaires', 'plugins', 'jobs']);
    radio.receiveContactMessage({ from: julie.publicKey, text: '/horaires' });
    await vi.waitFor(() => expect(radio.sent.map((m) => m.text)).toEqual(['Lun–Ven 7h–19h']));
    await client.destroy();
  });

  it('loads plugins immediately when load() runs after login', async () => {
    const { client } = await setupClient();
    await client.load(new URL('plugins-bot/', fixtures));
    expect(client.plugins.get('faq')?.loaded).toBe(true);
    expect(client.commands.get('horaires')).toBeDefined();
    await client.destroy();
  });

  it('accepts the load option of the constructor', async () => {
    const { FakeRadio, MockTransport } = await import('@meshcorejs/transports/mock');
    const { Client } = await import('../src/client/client.js');
    const { silentLogger } = await import('../src/logger.js');
    const transport = new MockTransport();
    new FakeRadio().attach(transport);
    const client = new Client({ transport, logger: silentLogger, load: new URL('bot/', fixtures) });
    await client.login();
    expect(client.commands.get('ping')).toBeDefined();
    await client.destroy();
  });

  it('reports every invalid file at once and registers nothing', async () => {
    const { client } = await setupClient({ login: false });
    const error = await client.load(new URL('broken/', fixtures)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LoadError);
    expect((error as LoadError).issues).toEqual([
      {
        file: 'commands/departs.ts',
        brick: 'command "departs"',
        message: 'required argument "gare" after optional argument "nombre"',
      },
      { file: 'commands/no-default.ts', brick: 'export default', message: 'is not a meshcore.js builder' },
    ]);
    expect(client.commands.cache.filter((c) => !c.core).size).toBe(0);
  });
});

describe('hot reload', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function workspace() {
    const root = await mkdtemp(join(new URL('.', import.meta.url).pathname, '.tmp-'));
    directories.push(root);
    await mkdir(join(root, 'commands'));
    const src = new URL('../src/index.js', import.meta.url).pathname;
    const write = (name: string, reply: string, commandName = 'ping') =>
      writeFile(
        join(root, 'commands', name),
        `import { CommandBuilder } from '${src}';\nexport default new CommandBuilder().setName('${commandName}').setHandler((ctx) => ctx.reply('${reply}'));\n`,
      );
    await mkdir(join(root, 'plugins'));
    const writePlugin = (name: string, reply: string) =>
      writeFile(
        join(root, 'plugins', name),
        `import { CommandBuilder, PluginBuilder } from '${src}';\nexport default new PluginBuilder().setName('faq').addBricks(new CommandBuilder().setName('faq').setHandler((ctx) => ctx.reply('${reply}')));\n`,
      );
    return { root, write, writePlugin };
  }

  it('reloads a plugin file as a unit and keeps the old plugin on failure', async () => {
    const { root, writePlugin } = await workspace();
    await writePlugin('faq.ts', 'v1');
    const { client } = await setupClient();
    const loader = new BrickLoader(client, root);
    await loader.load();
    await client.plugins.loadPending();
    const handler = () => client.commands.get('faq')?.definition.handler;
    const first = handler();
    expect(client.plugins.get('faq')?.loaded).toBe(true);

    await writePlugin('faq.ts', 'v2');
    await loader.reloadFile(join(root, 'plugins', 'faq.ts'));
    expect(handler()).not.toBe(first);
    expect(client.plugins.get('faq')?.loaded).toBe(true);

    await writeFile(join(root, 'plugins', 'faq.ts'), 'export default 42;\n');
    await loader.reloadFile(join(root, 'plugins', 'faq.ts'));
    expect(client.commands.get('faq')).toBeDefined();
    expect(client.plugins.get('faq')?.loaded).toBe(true);

    await rm(join(root, 'plugins', 'faq.ts'));
    await loader.reloadFile(join(root, 'plugins', 'faq.ts'));
    expect(client.plugins.get('faq')).toBeUndefined();
    expect(client.commands.get('faq')).toBeUndefined();
    await client.destroy();
  });

  it('replaces, keeps on error, and removes the bricks of a file', async () => {
    const { root, write } = await workspace();
    await write('ping.ts', 'v1');
    const { client } = await setupClient({ login: false });
    const loader = new BrickLoader(client, root);
    await loader.load();
    const handler = () => client.commands.get('ping')?.definition.handler;
    const first = handler();

    await write('ping.ts', 'v2');
    await loader.reloadFile(join(root, 'commands', 'ping.ts'));
    const second = handler();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);

    await writeFile(join(root, 'commands', 'ping.ts'), 'export default 42;\n');
    await loader.reloadFile(join(root, 'commands', 'ping.ts'));
    expect(client.commands.get('ping')).toBeDefined();

    await rm(join(root, 'commands', 'ping.ts'));
    await loader.reloadFile(join(root, 'commands', 'ping.ts'));
    expect(client.commands.get('ping')).toBeUndefined();
  });

  it('rolls back a reload that breaks cross-command validation', async () => {
    const { root, write } = await workspace();
    await write('ping.ts', 'pong');
    await write('pong.ts', 'pong', 'pong');
    const { client } = await setupClient({ login: false });
    const loader = new BrickLoader(client, root);
    await loader.load();

    await write('pong.ts', 'pong', 'ping');
    await loader.reloadFile(join(root, 'commands', 'pong.ts'));
    expect([...client.commands.cache.keys()].sort()).toEqual(['jobs', 'ping', 'plugins', 'pong']);
  });

  it('watches the folders when asked', { retry: 2 }, async () => {
    const { root, write } = await workspace();
    await write('ping.ts', 'v1');
    const { client } = await setupClient({ login: false });
    await client.load(root, { watch: true });
    await write('extra.ts', 'hi', 'extra');
    await vi.waitFor(() => expect(client.commands.get('extra')).toBeDefined(), { timeout: 10_000 });
    await client.destroy();
  });
});

describe('meshcore.js exports', () => {
  it('exposes Brick helpers for custom loaders', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod.isBrick).toBe('function');
    expect(mod.isBrick(new mod.CommandBuilder())).toBe(true);
    expect(mod.isBrick({ build() {} })).toBe(false);
  });
});
