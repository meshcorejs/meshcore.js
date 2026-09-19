# meshcore.js — agent guide

Bot framework for [MeshCore](https://github.com/meshcore-dev/MeshCore) radios running the **Companion Radio**
firmware: a `Client` with typed events and cached managers, and one standard of
builder-declared bricks (commands, events, jobs, permissions, roles). Not the official low-level client
(`@liamcottle/meshcore.js`).

This file covers the repository. **Every workspace package has its own `AGENTS.md`** with the same sections
(Purpose, Layout, Public API, Rules, Testing): read the one for the package you touch, and update it whenever
you change that package's public API, layout or invariants.

## Workspace map

| Path                   | npm name                 | Role                                                                                                        | Depends on                                                    |
| ---------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/protocol`    | `@meshcorejs/protocol`   | Companion protocol codec: framing, command/response/push encoders and decoders. No I/O.                     | nothing                                                       |
| `packages/transports`  | `@meshcorejs/transports` | `Transport` interface, TCP / serial / BLE, `/mock` subpath (`MockTransport`, `FakeRadio`)                   | `protocol`; optional peers `serialport`, `@abandonware/noble` |
| `packages/client`      | `@meshcorejs/client`     | The framework: `Client`, managers, builders, plugins, permissions, jobs. The only package users install.    | `protocol`, `transports`, `croner`                            |
| `packages/testing`     | `@meshcorejs/testing`    | `createTestClient()`: a bot on a `FakeRadio` with simulated time                                            | `transports`, `@sinonjs/fake-timers`; peer `meshcore.js`      |
| `examples/weather-bot` | private                  | The example bot: weather plugin + shared service, owner role, RadioConfig, cron job, tests (see its `AGENTS.md`) | `meshcore.js`, `serialport`                                   |

Build order (topological): protocol → transports → client → testing → examples.

## Commands

Run from the repository root.

```bash
pnpm install              # never installs serialport / noble (autoInstallPeers: false)
pnpm test                 # Vitest: packages/*/test and examples/*/test, against src/ (no build needed)
pnpm typecheck            # tsc --noEmit in every workspace
pnpm build                # tsc -p tsconfig.build.json, topological
pnpm check                # Biome: format + lint (recommended) + import order — what CI runs
pnpm check:fix            # apply Biome's safe fixes; pnpm format / pnpm lint for one of the two
pnpm check:types          # @arethetypeswrong/cli on the published packages (needs pnpm build)
pnpm check:publish        # publint on the published packages (needs pnpm build)
pnpm knip                 # unused files, exports and dependencies (knip.json knows the brick folders)
pnpm test:coverage        # same tests with a v8 coverage report in coverage/ (no threshold)
pnpm changeset            # describe a change to a published package (see .changeset/README.md)
pnpm vitest run packages/protocol   # one package's tests
```

GitHub: organisation `meshcorejs`, repository `meshcorejs/meshcore.js`, `main` protected (pull requests with a
green CI only). Workflows in `.github/workflows/`, every action pinned by commit SHA (Dependabot bumps them
weekly, grouped):

- `ci.yml` — check, typecheck, test with coverage (artifact), build, check:types, check:publish, knip on Node 22
  and 24; a job that loads the built `@meshcorejs/client` on Node 20; actionlint and typos (`_typos.toml` allows the
  French radio texts).
- `codeql.yml` — CodeQL for JavaScript/TypeScript on push, PR and weekly.
- `security.yml` — gitleaks (secrets in history) and Plumber (pipeline security score, SARIF to code scanning;
  on pushes to `main` it publishes the public score badge shown in the README, hence `id-token: write`).
- `release.yml` — Changesets on `main`: opens the "Version Packages" PR, publishes to npm with provenance when it
  is merged. Publishing uses npm trusted publishing (OIDC, `id-token: write`), no token: each package on
  npmjs.com must list this repository and `release.yml` as its trusted publisher.
- `dependabot.yml` — weekly grouped updates for npm and GitHub Actions.

Community files: `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, `.github/CODEOWNERS`, issue and PR templates.

## Global rules

Toolchain

- Node ≥ 22.12 to work on the repo (Vitest 5); published packages run on Node ≥ 20. pnpm 11, ESM only.
- TypeScript 7 `strict` with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
  `isolatedModules` (`tsconfig.base.json`).
- Biome (`biome.jsonc`) formats and lints TS/JS/JSON with the `recommended` preset; Markdown is not
  formatted. Disable a rule only in `biome.jsonc` (with a comment) or inline with a `biome-ignore` comment
  that states why; never silence one by rewriting sound code.
- Relative imports end in `.js` (NodeNext). `import type` for types.
- Every package's `exports` lists `"source": "./src/index.ts"` first: Vitest and `typecheck` resolve workspace
  dependencies to sources (`customConditions: ["source"]`); `tsconfig.build.json` resets it so builds use `dist`.
- `serialport` and `@abandonware/noble` are optional peer dependencies of `transports`: never add them to a
  package's `dependencies`, never import them statically. Tests inject fakes.
- Public API changes: update the package's `index.ts`, its tests, its `AGENTS.md`, and run `pnpm check:types`.

Domain invariants (details in each package's `AGENTS.md`)

- Serial/TCP framing: app → radio `'<' | len u16 LE | payload`, radio → app `'>' | len u16 LE | payload`,
  `MAX_FRAME_SIZE = 176`. The online Companion doc has the two markers backwards; the firmware is the reference.
- Text is limited to 160 UTF-8 **bytes**: DM budget 158, channel budget `160 − bytes("<bot name>: ")`. The
  library refuses (`MessageTooLongError`) rather than truncating silently.
- Command trigger rule is fixed and not configurable: `/name` in DM (`@Bot name` tolerated there too), `@Bot name`
  on channels. `help`, `plugins`
  and `jobs` are reserved (built-in commands, gated by core permissions).
- Channel authors are unauthenticated: commands with required permissions are refused on channels.
- The library never stores data (role membership, state): the user owns storage.
- Radio replies come from `client.replies` (English defaults, `frenchReplies` preset, partial overrides);
  command names and actions stay English; never leak technical details on the air.

Process

- **Never `git commit`, `git push` or tag**: Théo commits. Finish by listing changed files and proposing a
  commit message (see `CLAUDE.md`).
- Tests first (Vitest, fake timers for anything time-based). A change is done when `pnpm test`,
  `pnpm typecheck`, `pnpm build` and `pnpm check` pass.
