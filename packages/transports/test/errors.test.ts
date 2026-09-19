import { describe, expect, it } from 'vitest';
import { ConnectionError, MeshcoreError, MissingDependencyError } from '../src/errors.js';
import { importOptional } from '../src/optional-import.js';

describe('errors', () => {
  it('carry a stable code and their class name', () => {
    const error = new ConnectionError('boom', { cause: new Error('root') });
    expect(error).toBeInstanceOf(MeshcoreError);
    expect(error.code).toBe('CONNECTION_FAILED');
    expect(error.name).toBe('ConnectionError');
    expect((error.cause as Error).message).toBe('root');
  });

  it('MissingDependencyError names the package to install', () => {
    const error = new MissingDependencyError('serialport');
    expect(error.code).toBe('MISSING_DEPENDENCY');
    expect(error.moduleName).toBe('serialport');
    expect(error.message).toContain('pnpm add serialport');
  });
});

describe('importOptional', () => {
  it('imports installed modules', async () => {
    const path = await importOptional<typeof import('node:path')>('node:path');
    expect(path.join('a', 'b')).toBe('a/b');
  });

  it('turns a missing package into MissingDependencyError', async () => {
    await expect(importOptional('meshcorejs-package-that-does-not-exist')).rejects.toBeInstanceOf(
      MissingDependencyError,
    );
  });
});
