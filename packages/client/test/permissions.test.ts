import { fakeContactRecord } from '@meshcorejs/transports/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadError } from '../src/errors.js';
import { PermissionBuilder, Permissions } from '../src/permissions/permission-builder.js';
import { RoleBuilder } from '../src/permissions/role-builder.js';
import { setupClient } from './helpers.js';

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

const trainAlert = new PermissionBuilder().setName('train.alert').setDescription('Diffuser une alerte');

function issuesOf(build: () => unknown): string[] {
  try {
    build();
    return [];
  } catch (error) {
    if (!(error instanceof LoadError)) throw error;
    return error.issues.map((issue) => issue.message);
  }
}

async function setup() {
  let moderators = [marc.publicKey];
  const context = await setupClient({ contacts: [theo, julie, marc, lea], login: false });
  const { client } = context;
  const source = vi.fn(() => moderators);
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
      .setMembers([{ key: julie.publicKey.slice(0, 12).toUpperCase(), label: 'Julie' }]),
    new RoleBuilder()
      .setName('moderateur')
      .setPriority(10)
      .addPermissions(trainAlert, 'core.view_permissions')
      .setMembers(source, { cacheTtl: 60 }),
  ]);
  await client.login();
  const contact = (record: typeof theo) => client.contacts.cache.get(record.publicKey)!;
  return {
    ...context,
    source,
    setModerators: (keys: string[]) => {
      moderators = keys;
    },
    theo: contact(theo),
    julie: contact(julie),
    marc: contact(marc),
    lea: contact(lea),
  };
}

describe('PermissionBuilder / RoleBuilder validation', () => {
  it('validates permission names and reserves the core prefix', () => {
    expect(issuesOf(() => new PermissionBuilder().setName('Train Alert').build())).toEqual([
      'name must match /^[a-z0-9_.-]{1,64}$/',
    ]);
    expect(issuesOf(() => new PermissionBuilder().setName('core.hack').build())).toEqual([
      'the "core." prefix is reserved for built-in permissions',
    ]);
    expect(Permissions.Administrator.build()).toEqual({ name: 'core.administrator', description: 'Every permission' });
  });

  it('validates roles and static member keys', () => {
    expect(issuesOf(() => new RoleBuilder().setName('Admins').setMembers(['', 'abc']).build())).toEqual([
      'name must match /^[a-z0-9_-]{1,32}$/',
      'setPriority() needs an integer',
      'invalid member key ""',
      'invalid member key "abc"',
    ]);
  });

  it('refuses unknown permissions and duplicate priorities at login', async () => {
    const { client } = await setupClient({ login: false });
    client.register([
      new RoleBuilder().setName('a').setPriority(1).addPermissions('train.alert'),
      new RoleBuilder().setName('b').setPriority(1),
    ]);
    const error = await client.login().catch((e: unknown) => e);
    expect((error as LoadError).issues.map((issue) => issue.message)).toEqual([
      'unknown permission "train.alert"',
      'priority 1 is already used by role "a"',
    ]);
  });
});

describe('PermissionManager', () => {
  it('lists built-in and registered permissions', async () => {
    const { client } = await setup();
    expect(client.permissions.list().map((p) => p.name)).toEqual([
      'core.administrator',
      'core.manage_roles',
      'core.manage_contacts',
      'core.manage_channels',
      'core.manage_jobs',
      'core.manage_plugins',
      'core.view_permissions',
      'train.alert',
    ]);
  });

  it('resolves roles and permissions, with Administrator passing everywhere', async () => {
    const { client, theo, julie, marc, lea } = await setup();
    expect((await client.permissions.rolesOf(theo)).map((r) => r.name)).toEqual(['owner']);
    expect((await client.permissions.rolesOf(julie)).map((r) => r.name)).toEqual(['admin']);
    expect(await client.permissions.has(theo, Permissions.ManageJobs)).toBe(true);
    expect(await client.permissions.has(julie, trainAlert)).toBe(true);
    expect(await client.permissions.has(julie, Permissions.ManageJobs)).toBe(false);
    expect(await client.permissions.has(marc, 'train.alert')).toBe(true);
    expect(await client.permissions.has(lea, trainAlert)).toBe(false);
    expect([...(await client.permissions.resolve(marc))].map((p) => p.name).sort()).toEqual([
      'core.view_permissions',
      'train.alert',
    ]);
    expect(await client.permissions.hasRole(marc, 'moderateur')).toBe(true);
  });

  it('never grants anything to unverified channel authors', async () => {
    const { client } = await setup();
    const impostor = { name: 'Théo', verified: false as const };
    expect(await client.permissions.rolesOf(impostor)).toEqual([]);
    expect(await client.permissions.has(impostor, Permissions.Administrator)).toBe(false);
  });

  it('applies the hierarchy strictly', async () => {
    const { client, theo, julie, marc, lea } = await setup();
    const role = (name: string) => client.roles.get(name)!;
    expect(await client.permissions.canManageRole(julie, role('moderateur'))).toBe(true);
    expect(await client.permissions.canManageRole(julie, role('admin'))).toBe(false);
    expect(await client.permissions.canManageRole(theo, role('owner'))).toBe(false);
    expect(await client.permissions.canManageContact(julie, marc)).toBe(true);
    expect(await client.permissions.canManageContact(julie, theo)).toBe(false);
    expect(await client.permissions.canManageContact(lea, marc)).toBe(false);
    expect(await client.permissions.canManageContact(marc, lea)).toBe(true);
  });

  it('answers who holds a permission, merging roles and resolving contacts', async () => {
    const { client } = await setup();
    const holders = await client.permissions.whoHas(trainAlert);
    expect(holders.map((h) => [h.contact?.name, h.label, h.roles.map((r) => r.name)])).toEqual([
      ['Théo', undefined, ['owner']],
      ['Julie', 'Julie', ['admin']],
      ['Marc', undefined, ['moderateur']],
    ]);
    expect((await client.permissions.whoHas(Permissions.Administrator)).map((h) => h.contact?.name)).toEqual(['Théo']);
  });

  it('caches dynamic members for cacheTtl and re-reads them after invalidate()', async () => {
    const { client, source, setModerators, lea } = await setup();
    const moderateur = client.roles.get('moderateur')!;
    await client.permissions.has(lea, trainAlert);
    const calls = source.mock.calls.length;

    setModerators([lea.publicKey]);
    expect(await client.permissions.has(lea, trainAlert)).toBe(false);
    expect(source.mock.calls.length).toBe(calls);

    moderateur.invalidate();
    expect(await client.permissions.has(lea, trainAlert)).toBe(true);

    setModerators(['not-a-key', lea.publicKey]);
    await vi.advanceTimersByTimeAsync(61_000);
    expect((await moderateur.fetchMembers()).map((m) => m.contact?.name)).toEqual(['Léa']);
  });

  it('sorts roles by priority', async () => {
    const { client } = await setup();
    expect(client.roles.sorted().map((r) => r.name)).toEqual(['owner', 'admin', 'moderateur']);
    expect(client.roles.get('ADMIN')?.priority).toBe(100);
  });
});

describe('built-in permissions', () => {
  it('ships ManagePlugins as a core permission', async () => {
    const { client } = await setupClient({ login: false });
    expect(client.permissions.get(Permissions.ManagePlugins)?.name).toBe('core.manage_plugins');
  });
});
