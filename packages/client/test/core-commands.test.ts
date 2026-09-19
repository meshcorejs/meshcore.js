import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandBuilder } from '../src/commands/command-builder.js';
import { JobBuilder } from '../src/jobs/job-builder.js';
import { Permissions } from '../src/permissions/permission-builder.js';
import { RoleBuilder } from '../src/permissions/role-builder.js';
import { PluginBuilder } from '../src/plugins/plugin-builder.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-21T06:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const theo = fakeContactRecord({ name: 'Théo' });
const lea = fakeContactRecord({ name: 'Léa' });
const ping = () => new CommandBuilder().setName('ping').setHandler((ctx) => ctx.reply('pong'));

async function adminBot(permission = Permissions.Administrator) {
  const context = await setupClient({ self: { name: 'ClubBot' }, contacts: [theo, lea], login: false });
  const { client, radio } = context;
  client.register(
    new RoleBuilder().setName('owner').setPriority(1000).addPermissions(permission).setMembers([theo.publicKey]),
  );
  let seen = 0;
  const dm = async (from: typeof theo, text: string) => {
    radio.receiveContactMessage({ from: from.publicKey, text });
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    const texts = radio.sent.slice(seen).map((m) => m.text);
    seen = radio.sent.length;
    return texts;
  };
  return { client, radio, dm };
}

describe('/plugins', () => {
  it('is registered by the client, reserved, hidden from /help without the permission', async () => {
    const { client, dm } = await adminBot();
    client.register(ping());
    await client.login();
    expect(client.commands.get('plugins')?.core).toBe(true);
    expect(client.commands.get('jobs')?.core).toBe(true);
    expect(await dm(lea, '/help')).toEqual(['/ping']);
    expect(await dm(lea, '/plugins')).toEqual(['⛔ Permission denied']);
    expect(await dm(theo, '/help')).toEqual(['/ping\n/plugins [action] [name]\n/jobs [action] [name]']);
  });

  it('lists, unloads, loads and reloads plugins', async () => {
    const { client, dm } = await adminBot(Permissions.ManagePlugins);
    let count = 1;
    client.register([
      new PluginBuilder()
        .setName('faq')
        .setBricks(() =>
          Array.from({ length: count }, (_, i) => new CommandBuilder().setName(`faq${i}`).setHandler(() => 1)),
        ),
      new PluginBuilder().setName('meteo').setBricks(() => []),
    ]);
    await client.login();
    expect(await dm(theo, '/plugins')).toEqual(['faq ✅ 1\nmeteo ✅ 0']);
    expect(await dm(theo, '/plugins unload faq')).toEqual(['⏸️ faq unloaded']);
    expect(await dm(theo, '/plugins')).toEqual(['faq ⏸️\nmeteo ✅ 0']);
    expect(await dm(theo, '/plugins unload faq')).toEqual(['ℹ️ faq is already unloaded']);
    count = 2;
    expect(await dm(theo, '/plugins load faq')).toEqual(['✅ faq loaded (2)']);
    expect(await dm(theo, '/plugins load faq')).toEqual(['ℹ️ faq is already loaded']);
    count = 3;
    expect(await dm(theo, '/plugins reload faq')).toEqual(['✅ faq reloaded (3)']);
    expect(client.commands.get('faq2')).toBeDefined();
  });

  it('reports a failed reload briefly and keeps the old plugin', async () => {
    const { client, dm } = await adminBot(Permissions.ManagePlugins);
    let broken = false;
    client.register(
      new PluginBuilder().setName('faq').setBricks(() => {
        if (broken) throw new Error('faq.yaml: line 3: bad indentation');
        return [ping()];
      }),
    );
    await client.login();
    broken = true;
    expect(await dm(theo, '/plugins reload faq')).toEqual(['❌ faq: faq.yaml: line 3: bad indentation']);
    expect(client.commands.get('ping')).toBeDefined();
    expect(client.plugins.get('faq')?.loaded).toBe(true);
  });

  it('answers usage, unknown plugin and an empty list', async () => {
    const { client, dm } = await adminBot(Permissions.ManagePlugins);
    await client.login();
    expect(await dm(theo, '/plugins')).toEqual(['No plugins']);
    expect(await dm(theo, '/plugins reload')).toEqual(['⚠️ usage\n/plugins [action] [name]']);
    expect(await dm(theo, '/plugins reload nope')).toEqual(['❓ Unknown plugin']);
    expect(await dm(theo, '/plugins dance faq')).toEqual(['⚠️ action is invalid\n/plugins [action] [name]']);
  });
});

describe('/jobs', () => {
  it('lists jobs with their state and next run, and controls them', async () => {
    const { client, dm } = await adminBot(Permissions.ManageJobs);
    const runs = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60_000));
    });
    client.register([
      new JobBuilder()
        .setName('bulletin')
        .setCron('0 7 * * *', { timezone: 'UTC' })
        .setHandler(() => undefined),
      new JobBuilder().setName('slow').setInterval(3600).setOverlap('skip').setHandler(runs),
    ]);
    await client.login();
    expect(await dm(theo, '/jobs')).toEqual(['bulletin ▶️ 07:00\nslow ▶️ 07:00']);

    expect(await dm(theo, '/jobs pause bulletin')).toEqual(['⏸️ bulletin paused']);
    expect(await dm(theo, '/jobs pause bulletin')).toEqual(['ℹ️ bulletin is already paused']);
    expect(await dm(theo, '/jobs')).toEqual(['bulletin ⏸️\nslow ▶️ 07:00']);
    expect(await dm(theo, '/jobs resume bulletin')).toEqual(['▶️ bulletin resumed']);
    expect(await dm(theo, '/jobs resume bulletin')).toEqual(['ℹ️ bulletin is not paused']);

    expect(await dm(theo, '/jobs run slow')).toEqual(['▶️ slow started']);
    expect(runs).toHaveBeenCalledTimes(1);
    expect(await dm(theo, '/jobs')).toEqual(['bulletin ▶️ 07:00\nslow 🔄']);
    expect(await dm(theo, '/jobs run slow')).toEqual(['ℹ️ slow is already running']);
    expect(await dm(theo, '/jobs run nope')).toEqual(['❓ Unknown job']);
  });

  it('answers an empty list', async () => {
    const { client, dm } = await adminBot(Permissions.ManageJobs);
    await client.login();
    expect(await dm(theo, '/jobs')).toEqual(['No jobs']);
  });
});
