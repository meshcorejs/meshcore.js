export const BRICK = Symbol.for('meshcore.js.brick');

export type BrickKind = 'permission' | 'role' | 'command' | 'event' | 'job' | 'plugin';

export interface Brick<Definition = unknown> {
  readonly [BRICK]: BrickKind;
  build(): Definition;
}

/** @param value Anything, true for a meshcore.js builder */
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
