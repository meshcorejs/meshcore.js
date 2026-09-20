import { defineConfig } from 'vitest/config';

const conditions = ['source', 'module', 'node', 'development|production'];

export default defineConfig({
  ssr: {
    resolve: { conditions, externalConditions: ['source'] },
  },
  test: {
    env: { TZ: 'UTC' },
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'plugins/*/src/**/*.ts'],
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
    },
    include: [
      'packages/*/test/**/*.test.ts',
      'plugins/*/test/**/*.test.ts',
      'examples/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
    ],
  },
});
