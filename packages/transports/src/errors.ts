export class MeshcoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ConnectionError extends MeshcoreError {
  constructor(message: string, options?: ErrorOptions) {
    super('CONNECTION_FAILED', message, options);
  }
}

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
