import type { Client } from '../client/client.js';
import type { Contact } from '../structures/contact.js';
import { type Member, normalizeMembers, type RoleDefinition } from './role-builder.js';

export interface ResolvedMember extends Member {
  contact: Contact | null;
}

export class Role {
  readonly client: Client;
  readonly name: string;
  readonly description: string;
  readonly priority: number;
  readonly permissionNames: readonly string[];
  /** @internal */
  readonly definition: RoleDefinition;
  #cache: { members: Member[]; expiresAt: number } | null = null;
  #override: Member[] | null = null;

  /**
   * @param client Owning client
   * @param definition Built by RoleBuilder
   */
  constructor(client: Client, definition: RoleDefinition) {
    this.client = client;
    this.definition = definition;
    this.name = definition.name;
    this.description = definition.description;
    this.priority = definition.priority;
    this.permissionNames = Object.freeze([...definition.permissions]);
  }

  invalidate(): void {
    this.#cache = null;
  }

  /** @internal */
  _overrideMembers(members: Member[] | null): void {
    this.#override = members;
    this.#cache = null;
  }

  /** @internal */
  async members(): Promise<Member[]> {
    if (this.#override) return this.#override;
    const source = this.definition.members;
    if (typeof source !== 'function') return source;
    if (this.#cache && this.#cache.expiresAt > Date.now()) return this.#cache.members;
    const { members, invalid } = normalizeMembers(await source());
    for (const key of invalid) this.client.logger.warn(`role "${this.name}": ignoring invalid member key "${key}"`);
    if (this.definition.cacheTtlSeconds > 0) {
      this.#cache = { members, expiresAt: Date.now() + this.definition.cacheTtlSeconds * 1000 };
    }
    return members;
  }

  async fetchMembers(): Promise<ResolvedMember[]> {
    return (await this.members()).map((member) => ({
      ...member,
      contact: this.client.contacts.get(member.key) ?? null,
    }));
  }

  /** @param contact Contact to look up */
  async has(contact: Contact): Promise<boolean> {
    return (await this.members()).some((member) => contact.publicKey.startsWith(member.key));
  }

  toString(): string {
    return this.name;
  }
}
