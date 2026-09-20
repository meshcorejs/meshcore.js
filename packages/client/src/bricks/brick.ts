export const BRICK = Symbol.for('meshcore.js.brick');

/** Which kind of builder a `Brick` is, matching its scan folder (`permissions/`, `roles/`, `commands/`, …). */
export type BrickKind = 'permission' | 'role' | 'command' | 'event' | 'job' | 'plugin';

/** What every builder (`CommandBuilder`, `EventBuilder`, …) produces: a `build()` method tagged with its kind. */
export interface Brick<Definition = unknown> {
  readonly [BRICK]: BrickKind;
  build(): Definition;
}

/** Whether `value` is a meshcore.js builder instance, for custom loaders. */
export function isBrick(value: unknown): value is Brick {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<Brick>)[BRICK] === 'string' &&
    typeof (value as Partial<Brick>).build === 'function'
  );
}

export const BRICK_FOLDERS: ReadonlyArray<{ folder: string; kind: BrickKind }> = [
  { folder: 'permissions', kind: 'permission' },
  { folder: 'roles', kind: 'role' },
  { folder: 'commands', kind: 'command' },
  { folder: 'events', kind: 'event' },
  { folder: 'jobs', kind: 'job' },
  { folder: 'plugins', kind: 'plugin' },
];
