import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandBuilder } from '../src/commands/command-builder.js';
import type { DenyReason } from '../src/commands/context.js';
import { frenchReplies, type Replies } from '../src/commands/replies.js';
import { PermissionBuilder, Permissions } from '../src/permissions/permission-builder.js';
import { RoleBuilder } from '../src/permissions/role-builder.js';
import { flush, setupClient } from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-17T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const theo = fakeContactRecord({ name: 'Théo' });
const julie = fakeContactRecord({ name: 'Julie' });
const marc = fakeContactRecord({ name: 'Marc' });
const lea = fakeContactRecord({ name: 'Léa' });
const lyon = { index: 1, name: '#lyon', secret: new Uint8Array(16) };

/** Reproduces the permission example of the spec (annex A.7). */
async function trainBot(options: { replies?: Partial<Replies> } = {}) {
  const members: Record<string, string[]> = {};
  const trainAlert = new PermissionBuilder().setName('train.alert');
  const context = await setupClient({
    self: { name: 'TrainBot' },
    contacts: [theo, julie, marc, lea],
    channels: [lyon],
    login: false,
    ...options,
  });
  const { client, radio } = context;
  client.register([
    trainAlert,
    new RoleBuilder()
      .setName('owner')
      .setPriority(1000)
      .addPermissions(Permissions.Administrator)
      .setMembers([theo.publicKey]),
    new RoleBuilder()
      .setName('admin')
      .setPriority(100)
      .addPermissions(Permissions.ManageRoles, Permissions.ViewPermissions, trainAlert)
      .setMembers(() => members.admin ?? []),
    new RoleBuilder()
      .setName('moderateur')
      .setPriority(10)
      .addPermissions(trainAlert, Permissions.ViewPermissions)
      .setMembers(() => members.moderateur ?? []),
    new CommandBuilder()
      .setName('train')
      .addStringArg((a) => a.setName('numero').setRequired())
      .setHandler((ctx) => ctx.reply(`🚆 ${ctx.args.numero}`)),
    new CommandBuilder()
      .setName('alerte')
      .addStringArg((a) => a.setName('texte').setRequired().setRest())
      .setRequiredPermissions(trainAlert)
      .setHandler(async (ctx) => {
        await ctx.client.channels.get('#lyon')!.send(`🚨 ${ctx.args.texte}`);
        await ctx.reply('✅ diffusé');
      }),
    new CommandBuilder()
      .setName('promote')
      .addContactArg((a) => a.setName('contact').setRequired(true))
      .addRoleArg((a) => a.setName('role').setRequired(true))
      .setRequiredPermissions(Permissions.ManageRoles)
      .setHandler(async (ctx) => {
        const { contact, role } = ctx.args;
        if (!(await ctx.canManageRole(role))) return ctx.reply(`⛔ Tu ne peux pas attribuer ${role.name}`);
        if (await ctx.client.permissions.hasRole(contact, role))
          return ctx.reply(`ℹ️ ${contact.name} est déjà ${role.name}`);
        members[role.name] = [...(members[role.name] ?? []), contact.publicKey];
        role.invalidate();
        return ctx.reply(`✅ ${contact.name} → ${role.name}`);
      }),
    new CommandBuilder()
      .setName('demote')
      .addContactArg((a) => a.setName('contact').setRequired(true))
      .addRoleArg((a) => a.setName('role').setRequired(true))
      .setRequiredPermissions(Permissions.ManageRoles)
      .setHandler(async (ctx) => {
        const { contact, role } = ctx.args;
        if (!(await ctx.canManageRole(role))) return ctx.reply(`⛔ Tu ne peux pas retirer ${role.name}`);
        if (!(await ctx.canManageContact(contact))) return ctx.reply(`⛔ ${contact.name} a un rang ≥ au tien`);
        members[role.name] = (members[role.name] ?? []).filter((key) => key !== contact.publicKey);
        role.invalidate();
        return ctx.reply(`✅ ${contact.name} n'est plus ${role.name}`);
      }),
  ]);
  await client.login();
  const denied: DenyReason[] = [];
  client.on('commandDenied', (_ctx, reason) => denied.push(reason));

  let seen = 0;
  const dm = async (from: typeof theo, text: string) => {
    radio.receiveContactMessage({ from: from.publicKey, text });
    return collect();
  };
  const channel = async (senderName: string, text: string) => {
    radio.receiveChannelMessage({ channelIndex: 1, senderName, text });
    return collect();
  };
  const collect = async () => {
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    const texts = radio.sent.slice(seen).map((m) => m.text);
    seen = radio.sent.length;
    return texts;
  };
  return { client, denied, dm, channel };
}

describe('commands with required permissions', () => {
  it('reproduces the French transcript of the v1 spec with frenchReplies', async () => {
    const { dm, channel } = await trainBot({ replies: frenchReplies });
    expect(await dm(marc, '/promote Léa moderateur')).toEqual(['⛔ Permission refusée']);
    expect(await channel('Théo', '@TrainBot promote Léa admin')).toEqual(['@[Théo] ↪️ Envoie-moi cette commande en DM']);
  });

  it('follows the promote / demote transcript of the spec', async () => {
    const { dm } = await trainBot();
    expect(await dm(theo, '/promote Julie admin')).toEqual(['✅ Julie → admin']);
    expect(await dm(julie, '/promote Marc moderateur')).toEqual(['✅ Marc → moderateur']);
    expect(await dm(julie, '/promote Marc admin')).toEqual(['⛔ Tu ne peux pas attribuer admin']);
    expect(await dm(julie, '/demote Théo owner')).toEqual(['⛔ Tu ne peux pas retirer owner']);
    expect(await dm(marc, '/promote Léa moderateur')).toEqual(['⛔ Permission denied']);
    expect(await dm(marc, '/alerte Retards ligne A')).toEqual(['🚨 Retards ligne A', '✅ diffusé']);
    expect(await dm(julie, '/demote Marc moderateur')).toEqual(["✅ Marc n'est plus moderateur"]);
    expect(await dm(marc, '/alerte encore')).toEqual(['⛔ Permission denied']);
  });

  it('reports the missing permissions', async () => {
    const { dm, denied } = await trainBot();
    await dm(lea, '/alerte test');
    expect(denied).toEqual([{ type: 'missingPermissions', missing: [{ name: 'train.alert', description: '' }] }]);
  });

  it('refuses protected commands on channels, even for owners', async () => {
    const { channel, denied } = await trainBot();
    expect(await channel('Théo', '@TrainBot promote Léa admin')).toEqual(['@[Théo] ↪️ Send me this command in a DM']);
    expect(denied).toEqual([{ type: 'channelUntrusted' }]);
  });

  it('shows only the commands the author may run in the helper', async () => {
    const { dm, channel } = await trainBot();
    expect(await dm(lea, '/')).toEqual(['/train <numero>']);
    expect(await dm(theo, '/help')).toEqual([
      '/train <numero>\n/alerte <texte>\n/promote <contact> <role>\n/demote <contact> <role>\n/plugins [action] [name]\n/jobs [action] [name]',
    ]);
    expect(await channel('Théo', '@TrainBot')).toEqual(['@[Théo] @TrainBot train <numero>']);
  });

  it('refuses unknown permission references at login', async () => {
    const { client } = await setupClient({ login: false });
    client.register(
      new CommandBuilder()
        .setName('x')
        .setRequiredPermissions('nope')
        .setHandler(() => {}),
    );
    await expect(client.login()).rejects.toThrow('unknown permission "nope"');
  });

  it('warns when no role grants Administrator', async () => {
    const { client, transport } = await setupClient({ login: false });
    const warn = vi.spyOn(client.logger, 'warn');
    client.register(new RoleBuilder().setName('staff').setPriority(1).setMembers([]));
    await client.login();
    await flush();
    expect(warn).toHaveBeenCalledWith('no role grants Permissions.Administrator to anyone');
    expect(transport.connected).toBe(true);
  });
});
