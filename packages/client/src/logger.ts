/** Logging sink a `Client` writes to; pass a custom one through `ClientOptions.logger` to plug in your own. */
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

/** Minimum severity a `Logger` prints; `'silent'` prints nothing. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

/** Builds a `Logger` that writes to the console, prefixed `[meshcore.js]`, filtered by `level`. Default `'info'`. */
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

/** A `Logger` that discards everything; the default for `@meshcorejs/testing` bots. */
export const silentLogger: Logger = createConsoleLogger('silent');
