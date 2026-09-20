/** Base class of the library's errors: `code` identifies the kind without parsing the message. */
export class MeshcoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** The transport could not connect, or the connection was lost (`code: 'CONNECTION_FAILED'`). */
export class ConnectionError extends MeshcoreError {
  constructor(message: string, options?: ErrorOptions) {
    super('CONNECTION_FAILED', message, options);
  }
}

/** An optional dependency (`serialport`, `@abandonware/noble`) is not installed; the message says what to run. */
export class MissingDependencyError extends MeshcoreError {
  readonly moduleName: string;

  constructor(moduleName: string, options?: ErrorOptions) {
    super(
      'MISSING_DEPENDENCY',
      `optional dependency "${moduleName}" is not installed, run: pnpm add ${moduleName}`,
      options,
    );
    this.moduleName = moduleName;
  }
}
