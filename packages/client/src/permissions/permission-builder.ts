import { BRICK, type Brick } from '../bricks/brick.js';
import { LoadError } from '../errors.js';

export const PERMISSION_NAME_PATTERN = /^[a-z0-9_.-]{1,64}$/;
export const CORE_PERMISSION_PREFIX = 'core.';

export interface PermissionDefinition {
  name: string;
  description: string;
}

export class PermissionBuilder implements Brick<PermissionDefinition> {
  readonly [BRICK] = 'permission' as const;
  #name = '';
  #description = '';
  readonly #core: boolean;

  /** @param options core allows the reserved core. prefix */
  constructor(options: { core?: boolean } = {}) {
    this.#core = options.core ?? false;
  }

  get name(): string {
    return this.#name;
  }

  /** @param name Lowercase, letters digits _ . and -, 1 to 64 characters */
  setName(name: string): this {
    this.#name = name;
    return this;
  }

  /** @param description Free text for the bot author */
  setDescription(description: string): this {
    this.#description = description;
    return this;
  }

  build(): PermissionDefinition {
    const problems: string[] = [];
    if (!PERMISSION_NAME_PATTERN.test(this.#name)) problems.push(`name must match ${PERMISSION_NAME_PATTERN}`);
    if (!this.#core && this.#name.startsWith(CORE_PERMISSION_PREFIX)) {
      problems.push(`the "${CORE_PERMISSION_PREFIX}" prefix is reserved for built-in permissions`);
    }
    if (problems.length > 0) {
      throw new LoadError(problems.map((message) => ({ brick: `permission "${this.#name || '?'}"`, message })));
    }
    return { name: this.#name, description: this.#description };
  }
}

const core = (name: string, description: string) =>
  new PermissionBuilder({ core: true }).setName(`${CORE_PERMISSION_PREFIX}${name}`).setDescription(description);

export const Permissions = Object.freeze({
  Administrator: core('administrator', 'Every permission'),
  ManageRoles: core('manage_roles', 'Give and remove roles (limited by role hierarchy)'),
  ManageContacts: core('manage_contacts', 'Add, remove and edit radio contacts'),
  ManageChannels: core('manage_channels', 'Create and delete radio channels'),
  ManageJobs: core('manage_jobs', 'Run, pause and resume jobs'),
  ManagePlugins: core('manage_plugins', 'Load, unload and reload plugins'),
  ViewPermissions: core('view_permissions', 'See who has which role'),
});

export type PermissionLike = PermissionBuilder | string | { readonly name: string };

export function permissionName(permission: PermissionLike): string {
  return typeof permission === 'string' ? permission : permission.name;
}
