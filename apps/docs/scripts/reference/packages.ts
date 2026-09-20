export interface ReferencePackage {
  tab: string;
  name: string;
  dir: string;
  entries: string[];
  documented: boolean;
}

export const PACKAGES: readonly ReferencePackage[] = [
  { tab: 'client', name: '@meshcorejs/client', dir: 'packages/client', entries: ['src/index.ts'], documented: true },
  {
    tab: 'protocol',
    name: '@meshcorejs/protocol',
    dir: 'packages/protocol',
    entries: ['src/index.ts'],
    documented: true,
  },
  {
    tab: 'transports',
    name: '@meshcorejs/transports',
    dir: 'packages/transports',
    entries: ['src/index.ts', 'src/mock/index.ts'],
    documented: true,
  },
  {
    tab: 'testing',
    name: '@meshcorejs/testing',
    dir: 'packages/testing',
    entries: ['src/index.ts'],
    documented: true,
  },
];
