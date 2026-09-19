# Contributing

Thanks for helping with meshcore.js. The repository is a pnpm monorepo: `packages/*` are published, `examples/*`
are not.

## Setup

Node 22.12 or newer and pnpm 11 (`corepack enable`).

```bash
pnpm install
pnpm test
```

## Before opening a pull request

```bash
pnpm check          # Biome: format, lint, import order (pnpm check:fix applies the fixes)
pnpm typecheck
pnpm test
pnpm build
pnpm check:types    # published types (attw)
pnpm check:publish  # package.json sanity (publint)
pnpm knip           # unused exports and dependencies
```

CI runs the same commands on Node 22 and 24, plus CodeQL, gitleaks and Plumber. `main` is protected: every
change goes through a pull request with a green CI.

## Changesets

A change to a published package needs a changeset: run `pnpm changeset`, pick the packages and the bump
(patch, minor, major) and describe the change for the CHANGELOG. The four packages are versioned together. Docs,
tests and examples do not need one.

## Conventions

- TypeScript strict, ESM only, relative imports end in `.js`.
- Every building block of a bot is a builder. Radio texts come from `client.replies`.
- Each package has an `AGENTS.md` describing its layout, public API and rules: keep it in sync with the code.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
