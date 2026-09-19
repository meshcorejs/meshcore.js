export interface Logger {
  /**
   * @param message Log line
   * @param meta Extra values, like an error
   */
  debug(message: string, ...meta: unknown[]): void;
  /**
   * @param message Log line
   * @param meta Extra values, like an error
   */
  info(message: string, ...meta: unknown[]): void;
  /**
   * @param message Log line
   * @param meta Extra values, like an error
   */
  warn(message: string, ...meta: unknown[]): void;
  /**
   * @param message Log line
   * @param meta Extra values, like an error
   */
  error(message: string, ...meta: unknown[]): void;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

/** @param level Minimum level printed. Default info */
export function createConsoleLogger(level: LogLevel = 'info'): Logger {
  const enabled = (at: LogLevel) => ORDER[at] >= ORDER[level];
  const noop = () => {};
  return {
    debug: enabled('debug') ? (message, ...meta) => console.debug(`[meshcore.js] ${message}`, ...meta) : noop,
    info: enabled('info') ? (message, ...meta) => console.info(`[meshcore.js] ${message}`, ...meta) : noop,
    warn: enabled('warn') ? (message, ...meta) => console.warn(`[meshcore.js] ${message}`, ...meta) : noop,
    error: enabled('error') ? (message, ...meta) => console.error(`[meshcore.js] ${message}`, ...meta) : noop,
  };
}

export const silentLogger: Logger = createConsoleLogger('silent');
