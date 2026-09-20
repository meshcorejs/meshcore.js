import { BRICK, type Brick } from '../bricks/brick.js';
import { LoadError } from '../errors.js';
import { type PermissionLike, permissionName } from './permission-builder.js';

/** One member of a role: a public key (full, or a prefix of 12 hex characters or more), optionally with a label. */
export type MemberInput = string | { key: string; label?: string };
/** The members of a role, as given to `setMembers()`. */
export type MemberList = Iterable<MemberInput>;
/** Where a role's members come from: a fixed list, or a function returning one (sync or async), re-read after `cacheTtl` or `invalidate()`. */
export type MemberSource = MemberList | (() => MemberList | Promise<MemberList>);

/** A role member with its key normalised to lowercase. */
export interface Member {
  key: string;
  label?: string;
}

/** What a `RoleBuilder` builds: name, description, priority, permission names, members (list or source) and the cache TTL of a member source. */
export interface RoleDefinition {
  name: string;
  description: string;
  priority: number;
  permissions: string[];
  members: Member[] | (() => MemberList | Promise<MemberList>);
  cacheTtlSeconds: number;
}

export const ROLE_NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;
const KEY_PATTERN = /^[0-9a-f]{12,64}$/;

export function normalizeMembers(list: MemberList): { members: Member[]; invalid: string[] } {
  const members: Member[] = [];
  const invalid: string[] = [];
  for (const entry of list) {
    const raw = typeof entry === 'string' ? entry : entry.key;
    const key = String(raw).trim().toLowerCase();
    if (!KEY_PATTERN.test(key)) {
      invalid.push(String(raw));
      continue;
    }
    const label = typeof entry === 'string' ? undefined : entry.label;
    members.push(label === undefined ? { key } : { key, label });
  }
  return { members, invalid };
}

export class RoleBuilder implements Brick<RoleDefinition> {
  readonly [BRICK] = 'role' as const;
  #name = '';
  #description = '';
  #priority: number | null = null;
  readonly #permissions: PermissionLike[] = [];
  #members: MemberSource = [];
  #cacheTtlSeconds = 0;

  get name(): string {
    return this.#name;
  }

  /** @param name Unique role name */
  setName(name: string): this {
    this.#name = name;
    return this;
  }

  /** @param description Free text for the bot author */
  setDescription(description: string): this {
    this.#description = description;
    return this;
  }

  /** @param priority Unique integer, higher ranks above */
  setPriority(priority: number): this {
    this.#priority = priority;
    return this;
  }

  /** @param permissions Permissions granted by the role */
  addPermissions(...permissions: PermissionLike[]): this {
    this.#permissions.push(...permissions);
    return this;
  }

  /**
   * @param source Public keys, or a function returning them
   * @param options cacheTtl in seconds for a function source. Default 0
   */
  setMembers(source: MemberSource, options: { cacheTtl?: number } = {}): this {
    this.#members = source;
    this.#cacheTtlSeconds = options.cacheTtl ?? 0;
    return this;
  }

  build(): RoleDefinition {
    const problems: string[] = [];
    if (!ROLE_NAME_PATTERN.test(this.#name)) problems.push(`name must match ${ROLE_NAME_PATTERN}`);
    if (this.#priority === null || !Number.isInteger(this.#priority)) problems.push('setPriority() needs an integer');
    if (!Number.isFinite(this.#cacheTtlSeconds) || this.#cacheTtlSeconds < 0) problems.push('cacheTtl must be >= 0');

    let members: RoleDefinition['members'];
    if (typeof this.#members === 'function') {
      members = this.#members;
    } else {
      const normalized = normalizeMembers(this.#members);
      for (const key of normalized.invalid) problems.push(`invalid member key "${key}"`);
      members = normalized.members;
    }

    if (problems.length > 0) {
      throw new LoadError(problems.map((message) => ({ brick: `role "${this.#name || '?'}"`, message })));
    }
    return {
      name: this.#name,
      description: this.#description,
      priority: this.#priority as number,
      permissions: [...new Set(this.#permissions.map(permissionName))],
      members,
      cacheTtlSeconds: this.#cacheTtlSeconds,
    };
  }
}
