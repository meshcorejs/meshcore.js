import type { Client } from '../client/client.js';
import type { LoadIssue } from '../errors.js';
import type { Contact } from '../structures/contact.js';
import type { Author } from '../structures/message.js';
import { type PermissionDefinition, type PermissionLike, Permissions, permissionName } from './permission-builder.js';
import { Role } from './role.js';
import type { RoleDefinition } from './role-builder.js';

/** A registered permission, as listed by `client.permissions`. */
export interface Permission {
  readonly name: string;
  readonly description: string;
}

/** Someone holding a role: the public key (or prefix) from the role's members, its optional label, the cached `Contact` if the radio knows it, and the roles it holds. */
export interface PermissionHolder {
  key: string;
  label?: string;
  contact: Contact | null;
  roles: Role[];
}

/** `client.roles`: the registered roles, by name and in priority order, with the lookups used to check permissions. */
export class RoleManager {
  readonly client: Client;
  readonly #all: Role[] = [];

  /** @param client Owning client */
  constructor(client: Client) {
    this.client = client;
  }

  get size(): number {
    return this.#all.length;
  }

  /** @param name Role name */
  get(name: string): Role | undefined {
    const key = name.toLowerCase();
    return this.#all.find((role) => role.name === key);
  }

  sorted(): Role[] {
    return [...this.#all].sort((a, b) => b.priority - a.priority);
  }

  /** @internal */
  add(definition: RoleDefinition): Role {
    const role = new Role(this.client, definition);
    this.#all.push(role);
    return role;
  }

  /** @internal */
  remove(role: Role): void {
    const index = this.#all.indexOf(role);
    if (index !== -1) this.#all.splice(index, 1);
  }

  /** @internal */
  validate(): LoadIssue[] {
    const issues: LoadIssue[] = [];
    const names = new Set<string>();
    const priorities = new Map<number, string>();
    for (const role of this.#all) {
      const brick = `role "${role.name}"`;
      if (names.has(role.name)) issues.push({ brick, message: 'duplicate role name' });
      names.add(role.name);
      const other = priorities.get(role.priority);
      if (other !== undefined)
        issues.push({ brick, message: `priority ${role.priority} is already used by role "${other}"` });
      else priorities.set(role.priority, role.name);
      for (const permission of role.permissionNames) {
        if (!this.client.permissions.get(permission))
          issues.push({ brick, message: `unknown permission "${permission}"` });
      }
    }
    return issues;
  }
}

/** `client.permissions`: the registered permissions and the checks the command dispatcher runs before a handler: `has()`, `missing()`, `holders()`. */
export class PermissionManager {
  readonly client: Client;
  readonly #all: Permission[] = [];

  /** @param client Owning client */
  constructor(client: Client) {
    this.client = client;
    for (const builder of Object.values(Permissions)) this.add(builder.build());
  }

  /** @param permission Permission builder or name */
  get(permission: PermissionLike): Permission | undefined {
    const name = permissionName(permission);
    return this.#all.find((p) => p.name === name);
  }

  list(): Permission[] {
    return [...this.#all];
  }

  /** @internal */
  add(definition: PermissionDefinition): Permission {
    const permission: Permission = Object.freeze({ ...definition });
    this.#all.push(permission);
    return permission;
  }

  /** @internal */
  remove(permission: Permission): void {
    const index = this.#all.indexOf(permission);
    if (index !== -1) this.#all.splice(index, 1);
  }

  /** @internal */
  validate(): LoadIssue[] {
    const seen = new Set<string>();
    const issues: LoadIssue[] = [];
    for (const permission of this.#all) {
      if (seen.has(permission.name))
        issues.push({ brick: `permission "${permission.name}"`, message: 'duplicate permission name' });
      seen.add(permission.name);
    }
    return issues;
  }

  /** @param author Message author */
  async rolesOf(author: Author): Promise<Role[]> {
    if (!author.verified) return [];
    const roles: Role[] = [];
    for (const role of this.client.roles.sorted()) if (await role.has(author)) roles.push(role);
    return roles;
  }

  /**
   * @param author Message author
   * @param role Role or role name
   */
  async hasRole(author: Author, role: Role | string): Promise<boolean> {
    const target = typeof role === 'string' ? this.client.roles.get(role) : role;
    return target !== undefined && author.verified && (await target.has(author));
  }

  /** @param author Message author */
  async resolve(author: Author): Promise<Set<Permission>> {
    const result = new Set<Permission>();
    for (const role of await this.rolesOf(author)) {
      for (const name of role.permissionNames) {
        const permission = this.get(name);
        if (permission) result.add(permission);
      }
    }
    return result;
  }

  /**
   * @param author Message author
   * @param permission Permission builder or name
   */
  async has(author: Author, permission: PermissionLike): Promise<boolean> {
    return (await this.missing(author, [permission])).length === 0;
  }

  /** @internal */
  async missing(author: Author, required: PermissionLike[]): Promise<Permission[]> {
    if (required.length === 0) return [];
    const granted = await this.resolve(author);
    const names = new Set([...granted].map((p) => p.name));
    if (names.has(Permissions.Administrator.name)) return [];
    return required
      .filter((permission) => !names.has(permissionName(permission)))
      .map((permission) => this.get(permission) ?? { name: permissionName(permission), description: '' });
  }

  /** @param author Message author */
  async rank(author: Author): Promise<number> {
    const [top] = await this.rolesOf(author);
    return top?.priority ?? Number.NEGATIVE_INFINITY;
  }

  /**
   * @param author Message author
   * @param role Role to give or take
   */
  async canManageRole(author: Author, role: Role): Promise<boolean> {
    return (await this.rank(author)) > role.priority;
  }

  /**
   * @param author Message author
   * @param target Contact to act on
   */
  async canManageContact(author: Author, target: Contact): Promise<boolean> {
    const authorRank = await this.rank(author);
    return authorRank !== Number.NEGATIVE_INFINITY && authorRank > (await this.rank(target));
  }

  /** @param permission Permission builder or name */
  async whoHas(permission: PermissionLike): Promise<PermissionHolder[]> {
    const name = permissionName(permission);
    const holders = new Map<string, PermissionHolder>();
    for (const role of this.client.roles.sorted()) {
      if (!role.permissionNames.includes(name) && !role.permissionNames.includes(Permissions.Administrator.name))
        continue;
      for (const member of await role.fetchMembers()) {
        const holder = holders.get(member.key);
        if (holder) holder.roles.push(role);
        else {
          holders.set(member.key, {
            key: member.key,
            ...(member.label === undefined ? {} : { label: member.label }),
            contact: member.contact,
            roles: [role],
          });
        }
      }
    }
    return [...holders.values()];
  }
}
