# @meshcorejs/testing — agent guide

## Purpose

Lets bot authors test a whole bot without a radio: `createTestClient()` logs a real `Client` in on a
`FakeRadio` through a `MockTransport`, installs simulated time (`@sinonjs/fake-timers`), and offers
`dm()` / `channel()` helpers that return everything the bot put on the air. Re-exports the `/mock` tools of
`@meshcorejs/transports` for lower-level tests.

- Depends on: `@meshcorejs/transports` (`/mock`), `@meshcorejs/protocol` (types), `@sinonjs/fake-timers`;
  `@meshcorejs/client` as a **peer** (the bot's own copy is used).
- Used by: `examples/*/test`, users' test suites.

## Layout

```
src/
  index.ts          createTestClient, TestBot, TestClientOptions, parseDuration, fakeContactKey,
                    re-exports FakeRadio / MockTransport / fakeContactRecord / AckMode / FakeSentMessage
  test-client.ts    createTestClient(): fake clock install, login, settle loop, helper implementation
  duration.ts       parseDuration('30s' | '5m' | '1h' | '1d' | ms number)
test/
  test-client.test.ts
  fixtures/bot/     brick directory (commands, jobs, roles) loaded by the tests
```

## Public API

```ts
const bot = await createTestClient({ load?, self?, now?, maxChannels? = 8, radio?, replies?, fakeRadio? });
bot.client; bot.radio; bot.transport; bot.clock          // underlying objects
bot.fakeContact(name, overrides?): Contact               // adds a contact to the radio and the cache
bot.fakeChannel(name, secret?): Channel                  // first free slot
bot.fakeChannel('Public', PUBLIC_CHANNEL_SECRET): Channel  // a Public channel (secret from '@meshcorejs/protocol')
bot.setRoleMembers(role, [contact | key]): void          // overrides the role's member source for the test
await bot.dm(contact | name, '/cmd …'): string[]         // texts sent by the bot while handling it
await bot.channel('#name', authorName, '@Bot cmd …'): string[]
await bot.setTime(iso | Date | ms); await bot.advanceTime('1d' | ms)   // jobs and cooldowns follow
bot.sentTo('#name' | contactName): string[]              // everything sent to that target so far
await bot.destroy();
fakeContactKey(name): string                              // the deterministic key fakeContact() would use
```

`radio` is the bot's `RadioConfig` (as on `Client`), `fakeRadio` the emulated radio's own options.

`dm()` / `channel()` settle by ticking the fake clock until the send queue, the command pipeline and the
radio's pending messages are idle, so a test never needs to await timers itself.

## Rules

- `createTestClient()` installs **sinon fake timers globally** (`setTimeout`, `setInterval`, `setImmediate`,
  `Date`). Never combine it with `vi.useFakeTimers()`; always `await bot.destroy()` (uninstalls the clock) in
  `afterEach` / `afterAll`.
- The helpers reach into `@meshcorejs/client` internals through a handful of `@internal` hooks
  (`contacts._patchFromRadio`, `channels._apply`, `role._overrideMembers`, `sendQueue.idle`,
  `commands.inFlight`). If you rename one of those in `@meshcorejs/client`, update this package in the same change.
- Default self name is `TestBot`; pass `self: { name }` when the trigger mention matters (`@MyBot cmd`).
- `dm()` accepts a contact name only for contacts created with `fakeContact()`; unknown names throw.
- Keep the surface small: what a bot author needs to replay a transcript and drive the clock, nothing more.

## Testing

- `pnpm vitest run packages/testing`. Tests load `test/fixtures/bot` and replay DM/channel commands, role
  overrides and cron jobs against the simulated calendar.
- When you change the settle heuristics, re-run any example tests too (`pnpm vitest run examples`): a bot
  loaded from a real brick directory is the integration suite for this package.

## References

- Root `AGENTS.md` (repo conventions), `packages/client/AGENTS.md` (the hooks this package uses),
  `examples/weather-bot/AGENTS.md` (a bot tested with this package).
