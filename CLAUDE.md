# meshcore.js

## Git

- **Never commit.** The reviewer makes every commit (`git commit`, `git commit --amend`, `git push`, tags included).
- `git status`, `git diff` and `git log` are fine to read the state of the repository.
- When a plan or a skill asks for a "Commit" step, stop instead: list the changed files, suggest a commit
  message, and wait for reviewer to commit.

## Agent docs

@AGENTS.md

Every package has its own `AGENTS.md` with the same sections: read it before touching the package, update it
when the public API, the layout or the invariants change.
