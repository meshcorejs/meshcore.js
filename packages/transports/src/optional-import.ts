import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MissingDependencyError } from './errors.js';

function isModuleNotFound(error: unknown, moduleName: string): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') && error.message.includes(moduleName);
}

async function importFromApplication<T>(moduleName: string): Promise<T> {
  const require = createRequire(join(process.cwd(), 'noop.js'));
  return (await import(pathToFileURL(require.resolve(moduleName)).href)) as T;
}

/** @param moduleName Package to import */
export async function importOptional<T>(moduleName: string): Promise<T> {
  try {
    return (await import(moduleName)) as T;
  } catch (error) {
    if (!isModuleNotFound(error, moduleName)) throw error;
    try {
      return await importFromApplication<T>(moduleName);
    } catch {
      throw new MissingDependencyError(moduleName, { cause: error });
    }
  }
}
