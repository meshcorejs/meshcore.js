# @meshcorejs/plugin-ai — agent guide

## Purpose

Official plugin: `/ask <question>` answered by an OpenAI-compatible model through the `openai` SDK. The
first of the `plugins/*` packages; its layout is the model for the others.

- Depends on: peer `@meshcorejs/client` (only its public API: `PluginBuilder`, `CommandBuilder`,
  `MessageBuilder`, `PermissionLike`), `openai`.
- Used by: bots, through `ai.configure({ apiKey })` in a `plugins/` file.

## Layout

```
src/index.ts      the PluginBuilder (default export), createDeps(), re-exports of types and replies
src/options.ts    AiOptions, AiDeps, DEFAULTS
src/replies.ts    Replies, englishReplies, frenchReplies, mergeReplies
src/history.ts    History: short memory per author, pure
src/ask.ts        askCommand(client, deps, permission?)
test/             ai.test.ts (createTestClient + fake openai), history.test.ts, replies.test.ts, fake-openai.ts
```

## Public API

Default export `PluginBuilder<AiOptions>`; `AiOptions`, `AiDeps`, `OpenAILike`, `Replies`, `englishReplies`,
`frenchReplies`, `mergeReplies`, `History`, `Turn`, `createDeps`.

## Rules

- No change to `@meshcorejs/client` for this plugin; a need for one is a design question, not a patch.
- Secrets come from options, never from `process.env`.
- Nothing on disk; `History` is RAM and resets on reload.
- Nothing technical on the air: failures answer `replies.unavailable` and `client.logger.warn`.
- Defaults live in `DEFAULTS` only; the README table mirrors them.
- Every text on the air comes from `Replies`; adding a language is a new preset object.
- `openai` option replaces the SDK client in tests; tests never touch the network.

## Testing

`pnpm vitest run plugins/ai`. Fake timers come with `createTestClient()`; `bot.advanceTime('31s')` moves past
the cooldown. `pnpm build` then `pnpm check:types` and `pnpm check:publish` validate the published shape.
