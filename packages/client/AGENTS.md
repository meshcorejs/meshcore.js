# @meshcorejs/client — agent guide

## Purpose

The bot framework (`@meshcorejs/client`), and the only package users install. A `Client` logs into a Companion radio over a
`Transport`, keeps contact/channel caches, turns radio messages into `Message` objects, and runs the bricks
declared with builders: commands (fixed trigger rule, typed args, permissions, cooldowns), events, jobs
(cron/interval), permissions and roles. Outgoing text goes through a paced send queue with DM ACKs and
retries; `MessageBuilder` renders byte-budgeted messages.

- Depends on: `@meshcorejs/protocol`, `@meshcorejs/transports` (re-exports `TcpTransport`, `SerialTransport`,
  `BleTransport`, `Transport`, `TypedEmitter`), `croner` (cron).
- Used by: `@meshcorejs/testing` (peer), `examples/*`.

## Layout

```
src/
  index.ts                     public surface — every export below is listed here
  client/
    client.ts                  Client: options, login() handshake, message sync, health check, reconnection, destroy()
    events.ts                  ClientEvents (typed event map), ErrorSource
    registry.ts                BrickRegistry: build() bricks, hand definitions to managers, remember source file
    loader.ts                  BrickLoader: scan permissions/ roles/ commands/ events/ jobs/ plugins/, import default, watch; a module path → its folder
  bricks/brick.ts              BRICK brand symbol, BrickKind (incl. 'plugin'), BRICK_FOLDERS (scan order), isBrick
  plugins/
    plugin-builder.ts          PluginBuilder<Options>: setBricks | addBricks / configure() (copy), PluginDefinition
    plugin.ts                  Plugin: state pending|loaded|unloaded, load/unload/reload with rollback
    plugin-manager.ts          PluginManager (client.plugins): get(name) | get(builder), loadPending()
  radio/
    request-queue.ts           RequestQueue: one Companion command in flight, expected-response collectors, 5 s timeout
    radio.ts                   Radio: typed wrappers (appStart, deviceQuery, getContacts, syncNextMessage, sendText, …)
    radio-settings.ts          RadioParams / Location, validators, app ↔ wire unit conversion, SelfInfo comparators
    radio-config.ts            RadioConfig (validated, frozen, diff(self)), RadioSetting
  managers/
    contact-manager.ts         ContactManager (cache, get by key/prefix, fetch, remove, resetPath), Advert
    channel-manager.ts         ChannelManager (cache, get by name/index, create, delete), hashtagChannelSecret
  structures/                  Contact, Channel (index, name, secret, isHashtag, isPublic, send), Message (author, backlog, snr, hopCount, tooFar…)
  messages/
    send-queue.ts              SendQueue: 2 s pacing, DM ACK wait, resends, RESET_PATH + flood, 5 min expiry
    sent-message.ts            SentMessage { status, delivered() }
    text.ts                    DM_TEXT_BUDGET = 158, channelTextBudget(selfName, mention?)
  builders/message-builder.ts  MessageBuilder: title/lines/fields/footer, overflow error | truncate | split
  commands/
    command-builder.ts         CommandBuilder({ core? }), COMMAND_NAME_PATTERN, RESERVED_COMMAND_NAMES ['help', 'plugins', 'jobs'], DEFAULT_MAX_AGE_SECONDS
    args.ts                    ArgBuilder + typed arg definitions (string, integer, number, boolean, choice, contact, role, channel)
    command.ts                 Command (built definition + precomputed usages), scopeOf(message) (internal)
    trigger.ts                 the trigger rule: '/name' in DM (or '@Bot name'), '@Bot name' on channels
    tokenize.ts / parse-args.ts  whitespace + double-quote tokenizer, ArgumentError
    command-manager.ts         pipeline on messageCreate, cooldowns, built-in helper (HELPER_MAX_PARTS = 3); core commands listed last
    replies.ts                 Replies interface, englishReplies (default), frenchReplies, mergeReplies
    core/                      built-in /plugins and /jobs: CommandBuilder({ core: true }) gated by core.manage_plugins / core.manage_jobs
    context.ts                 CommandContext (reply, replyDM, can, canManageRole, canManageContact), DeniedContext, DenyReason
    replies.ts                 Replies: every French text the library puts on the air
  events/                      EventBuilder, EventManager (ordered, isolated handlers)
  jobs/                        JobBuilder, Job (run/pause/resume/nextRun/lastRun/running), JobManager
  permissions/
    permission-builder.ts      PermissionBuilder, Permissions.* built-ins, CORE_PERMISSION_PREFIX 'core.'
    role-builder.ts            RoleBuilder: priority, permissions, setMembers(source, { cacheTtl })
    role.ts                    Role: fetchMembers(), invalidate()
    permission-manager.ts      PermissionManager (has, rolesOf, resolve, rank, canManage*, whoHas), RoleManager
  collection.ts                Collection<K, V> (Map + find/filter/map/first/sorted)
  errors.ts                    MeshcoreError subclasses, LoadError { errors: LoadIssue[] }
  logger.ts                    Logger, createConsoleLogger, silentLogger
test/
  helpers.ts                   setupClient() → { client, radio, transport } on MockTransport + FakeRadio; flush()
  fixtures/bot, fixtures/broken   brick directories for load() tests
  *.test.ts                    one file per area (login, messages, reconnect, send-queue, commands, permissions, jobs…)
```

## Public API

- `new Client({ transport, radio?: RadioConfig, replies?: Partial<Replies>, logger?, appName? = 'meshcore.js', load?, maxHops? })`
  — infrastructure only, no bot content. `client.replies` is the merge of `englishReplies` and the override;
  `frenchReplies` is a complete French preset (`replies: frenchReplies`). `client.register(brick | brick[])`, `client.load(dir, { watch? })`, `client.login()`,
  `client.destroy()`, `client.status`, `client.isReady`, `client.self`, `client.device` (throw
  `ClientStateError` before login), `client.radioConfig`, `client.maxHops: number | null` (validated: integer
  ≥ 0, `RangeError` otherwise; `null` means no limit).
- Managers: `client.contacts`, `client.channels`, `client.commands`, `client.events`, `client.jobs`,
  `client.permissions`, `client.roles`, `client.sendQueue`, `client.radio` (typed Companion commands, e.g.
  `sendSelfAdvert(flood)`, `exportSelfContact()`), `client.logger`, `client.transport`.
- `client.radio.setAdvertName / setAdvertLatLon / setTxPower / setRadioParams` — app units (MHz, kHz, dBm,
  degrees), validated (`RangeError`), radio refusal → `RadioError`.
- `client.radio.request<T = void>(code, payload?: Uint8Array, collect?: Collector<T>)` — the door for a
  Companion command without a typed wrapper: `code` a byte (`RangeError` otherwise), `payload` the command body
  without the code byte (default empty), `collect` turns response frames into `T` (default expects `Ok`).
  `expectType(type, map)` builds a `Collector` that resolves on the first frame of `type`. Refused
  (`GuardedCommandError`) for `SendTxtMsg`, `SendChannelTxtMsg`, `SendSelfAdvert`. Both `expectType` and
  `Collector` are exported for this.
- Events (`ClientEvents`): `ready`, `disconnect`, `reconnecting`, `error(error, source)`, `messageCreate`,
  `messageDelivered`, `messageFailed`, `advert`, `contactAdd|Update|Remove`, `contactsFull`, `channelUpdate`,
  `commandRun`, `commandError`, `commandDenied(ctx, reason)`, `pluginLoad`, `pluginUnload`, `raw`. `ErrorSource.type`
  is `command | event | job | plugin | internal`.
- Bricks: `CommandBuilder`, `EventBuilder`, `JobBuilder`, `PermissionBuilder`, `RoleBuilder`, `PluginBuilder`,
  `Permissions` (`Administrator`, `ManageRoles`, `ManageContacts`, `ManageChannels`, `ManageJobs`,
  `ViewPermissions`, `ManagePlugins`). `Brick`, `BrickKind`, `isBrick` are exported for custom loaders (`BRICK` stays
  internal). `Command.core` marks the built-in commands.
- Handler and data types used in public signatures are exported for typing user code: `CommandHandler`,
  `UsageErrorHandler`, `CommandErrorHandler`, `MemberList`, `MessageData`, `RadioEvents`.
- Plugins: `PluginBuilder<Options>` is the sixth brick — `setBricks((client, options) => bricks)` or
  `addBricks(...)`, `configure(options)` returns a configured **copy** (absent from the type when
  `Options = void`); the factory runs at load, never at construction. `client.plugins` (`cache`, `size`,
  `get(name)` → `Plugin | undefined`, `get(builder)` → `Plugin`, throws if unregistered); `Plugin` (`name`,
  `description`, `state`, `loaded`, `bricks`, `load()`, `unload()`, `reload()`). **No shared-service
  mechanism**: a plugin that needs a service takes the instance in its options; sharing it with the rest of
  the bot is the bot's business.
- Sending: `contact.send()`, `channel.send()`, `message.reply()`, `ctx.reply()` accept `string |
MessageBuilder` and resolve to `SentMessage`; `MessageBuilder` (`setOverflow`, `measure`, `build(budget)`).
- Errors: `MeshcoreError { code }` → `LoadError`, `ConnectionError`, `ClientStateError`,
  `UnsupportedFirmwareError`, `JobTimeoutError`, `MissingDependencyError`, `CommandTimeoutError`, `RadioError`,
  `RadioConfigError`, `LimitReachedError`, `MessageTooLongError`, `DeliveryFailedError`, `PublicChannelError`,
  `RateLimitError` (`resource: RateLimitedResource`, `channel`, `limit`, `windowMs`, `retryAfterMs`), `TooFarError`
  (`hopCount`, `maxHops`) — thrown by `message.reply()` / `ctx.reply()` when `message.tooFar` is true.
  `GuardedCommandError` (`commandCode`) — thrown by `client.radio.request()` for the three commands that
  transmit on the mesh.
- Tuning constants are exported but not configurable: `SEND_INTERVAL_MS = 2000`, `DM_MAX_RESENDS = 3`,
  `SEND_EXPIRY_MS = 5 min`, `RECONNECT_BASE_DELAY_MS = 1 s`, `RECONNECT_MAX_DELAY_MS = 60 s`,
  `HEALTH_CHECK_INTERVAL_MS = 60 s`, `HEALTH_CHECK_MAX_FAILURES = 2`, `DESTROY_FLUSH_TIMEOUT_MS = 5 s`,
  `DEFAULT_MAX_PARTS = 3`, `CHANNEL_SEND_LIMIT = 10`, `CHANNEL_SEND_WINDOW_MS = 5 min`,
  `ADVERT_FLOOD_INTERVAL_MS = 30 min`.

## Rules

API shape (Théo's taste)

- **Builders everywhere.** Every brick is a `*Builder` with chainable `setX` / `addX` and a `build()` that
  throws a `LoadError` listing all its problems. No plain-object config, no alternative registration path.
- **`Client` takes infrastructure only** (`transport`, `logger`, `appName`, `load`, `radio`). No owners, no
  trigger options, no defaults for commands, no exposed queue/reconnect settings.
- **A plugin is the unit of dynamism.** `register()` returns `this` and `RegisteredBrick` stays internal; to
  unload or reload bricks, put them in a plugin. Plugins registered before `login()` are `pending` and loaded by
  `login()` (before global validation); after `ready`, `register()` and `load()` load
  them at once and report failures through `error` with `source.type === 'plugin'`. `Plugin.load()` validates
  globally when the client is past `idle` and registers nothing on failure; `reload()` restores the previous
  bricks on failure. Issues from a plugin's bricks are prefixed `<plugin> › `; a factory that throws a
  `TypeError` on an unconfigured plugin is reported as `<plugin> › options: configure() is missing`. No plugin
  inside a plugin, no `dispose`, no `setDefaults()` — defaults live in the factories.
- **The library never stores anything.** Role membership comes from a user-provided source
  (`setMembers(keys | () => keys, { cacheTtl })`); to change it, users update their source and call
  `role.invalidate()`.

Commands

- Trigger rule is fixed: DM `/name` (no space after `/`) — the channel form is tolerated in DM too —, channel
  `@Bot name` (`@[Name]` or `@Name`, case-insensitive, never `/`). Anything else is only `messageCreate`. Do not
  add options or hooks to change it.
- Scopes (`CommandScope`): `dm | channel | public`. `setScope()` defaults to `dm` and `channel`; the firmware's
  Public channel (`Channel.isPublic`) is never included unless a command opts in with `setScope('public')` (or
  lists it alongside the others). `scopeOf(message)` (internal, `commands/command.ts`) maps a received message
  to its scope and drives both the pipeline and the helper.
- Pipeline order: trigger → maxHops → scope → maxAge → permissions → cooldown → args → handler. A message from
  beyond `client.maxHops` (`Message.hopCount`) is dropped silently, before the helper branch, so a `@Bot` from
  too far gets nothing either. Every refusal emits `commandDenied` with a typed `DenyReason`; **on a channel
  every refusal is silent**
  (`commandDenied` only — the bot only speaks to answer a command it executed); only a DM gets a text from
  `client.replies` — **English by default**, `frenchReplies` preset, partial override. Only texts are
  configurable: command names and actions (`help`, `plugins`, `jobs`, `load`, `unload`, `reload`, `run`, `pause`,
  `resume`) stay English. **Breaking:** `Replies.unknownCommandChannel` and `Replies.channelUntrusted` are
  removed — every channel refusal is silent now — and `Replies.helperChannel(names)` replaces them for the
  one line the bot may send on a channel.
- Built-in helper (`/`, `/help`, `@Bot`, `@Bot help`): filtered by scope and (in DM) by the author's
  permissions; channel lists only permission-free commands. In a DM, one syntax line per command. On a
  channel, one line (`Replies.helperChannel(names)`) with the usable command names, trimmed from the end
  (marked with `…`) to fit the channel's byte budget. When nothing is usable there, the bot answers
  `noCommands` on an ordinary channel but stays silent on Public.
- Reserved names: `help`, `plugins`, `jobs`. The built-in `/plugins [load|unload|reload <name>]` and
  `/jobs [run|pause|resume <name>]` are ordinary `CommandBuilder({ core: true })`s registered by the `Client`
  constructor (`commands/core/`), listed after user commands in the helper, DM-only through their required
  permission (`ManagePlugins` / `ManageJobs`), so a bot without roles exposes nothing extra. Never add an option
  to disable them; gate new ones with a `core.*` permission. A `LoadError` from `/plugins` is summarised on
  the air (`pluginFailed`), other errors follow the normal `commandError` path.
- Commands with required permissions are refused on channels (`channelUntrusted`): channel authors are
  unauthenticated text.
- Argument rules validated at load: unique names, no required after optional (a default makes an arg
  optional), `setRest` only on the last arg. `ctx.args` types are inferred from the builder chain.

Sending

- Budgets in UTF-8 bytes: DM 158, channel `160 − bytes("<self.name>: ")` minus the `@[author] ` mention
  when replying. Plain strings use overflow `error`; never truncate silently.
- `SendQueue` is the only path to the air: 2 s between transmissions, parts of one message contiguous, DM
  ACK on `SEND_CONFIRMED` matching `SENT.expected_ack`, up to 3 resends then `RESET_PATH` + one flood, then
  `messageFailed`. Channel sends resolve immediately (`status: 'sent'`).
- `Radio.sendText()` and `Radio.sendChannelText()` are `@internal` (excluded from the reference) and only
  called by `SendQueue`: they carry no guard at all. `contact.send()` / `channel.send()` / `SendQueue` are the
  only path to the air; `Radio.sendSelfAdvert()` stays public because it is itself guarded (see below).
- No splitting inside a code point or an emoji ZWJ sequence (`Intl.Segmenter`).
- Public: `SendQueue.send()` refuses a Public target unless the `@internal` `allowPublic` option is set, which
  only `CommandContext.reply()` and the command manager's `#safeReply` set; `channel.send()` / `message.reply()`
  there reject with `PublicChannelError`.
- Rate limit: 10 parts / 5 min sliding window per channel, counted at acceptance, a message that does not fit
  whole is refused whole; DMs are not limited; a `RateLimitError` escaping a handler is logged, not answered on
  the air.

Client lifecycle

- `login()`: validate bricks → connect → `APP_START` → `DEVICE_QUERY` (firmware < 3 →
  `UnsupportedFirmwareError`) → `SET_DEVICE_TIME` → radio config → contacts → channels (`maxChannels` from
  the device, never hard-coded) → drain `SYNC_NEXT_MESSAGE` (messages flagged `backlog: true`) → start jobs
  → `ready`.
- `radio: RadioConfig` is applied right after `SET_DEVICE_TIME`: only declared fields, only when they differ
  from `client.self`, `txPower` pre-checked against `self.maxTxPowerDbm`; then `APP_START` again so
  `client.self` is the radio's truth, and one flood advert if name or location changed. A refusal is a
  `RadioConfigError` that fails `login()`; during reconnection it is retried with the backoff. `repeat` is
  passed to `SET_RADIO_PARAMS` only on firmware ≥ 9, with the device's current value.
- `Radio.sendSelfAdvert(true)` (flood) is limited to one per `ADVERT_FLOOD_INTERVAL_MS`
  (`RateLimitError { resource: 'advert' }` otherwise); zero-hop adverts (`sendSelfAdvert(false)`) are always
  free. `login()`'s identity-changed advert counts against that window; when it is refused, `login()` logs a
  warning instead of failing. The window it reserves is only rolled back on a `RadioError` (the firmware
  answered `Err`, so nothing went out); a timeout or any other failure keeps it consumed, since a lost reply
  does not prove the flood was never sent and the reconnect loop would otherwise retry it every flap.
- Transports never reconnect; `Client` does (exponential backoff 1 s → 60 s, unlimited, health ping every
  60 s, 2 failures). After reconnection the cache is reconciled and only differences emit events.
- One Companion command in flight at a time (`RequestQueue`); pushes (`0x80+`) bypass the queue.
- `radio.request()` is the door for Companion commands without a wrapper; `SendTxtMsg`, `SendChannelTxtMsg`
  and `SendSelfAdvert` are refused there (`GuardedCommandError`) because they transmit on the mesh; never
  write raw frames to `client.transport`.
- Error policy: only `load()`, `login()` and `plugin.load()/unload()/reload()` throw. Handler errors → `commandError` + `Replies.internalError`;
  event/job errors → `error` with `source.type`; without an `error` listener, log and never crash.
- `client.load()` scans `permissions/ roles/ commands/ events/ jobs/ plugins/` in that order, recursively,
  importing `.ts/.js/.mjs` files except `.d.ts`, `*.test.*`, `*.spec.*` and `_`-prefixed; brick kind comes from
  the instance, a brick outside its folder only warns. `load()` also accepts a module URL/path
  (`import.meta.url`) and uses its folder. `watch: true` hot-reloads per file (a plugin file reloads the whole
  plugin) and keeps the old brick on failure.

## Testing

- `pnpm vitest run packages/client`. Use `setupClient()` from `test/helpers.ts` (`MockTransport` +
  `FakeRadio`, `silentLogger`) and Vitest fake timers (`vi.useFakeTimers()`, `flush()`) for anything that
  waits: send pacing, ACK timeouts, backoff, cooldowns, jobs, the channel and advert rate limits.
  `setupClient({ maxHops })` sets the client's limit for hop-related tests.
- Drive the radio side with `radio.receiveContactMessage()`, `radio.receiveChannelMessage()`, `radio.ack()`,
  `radio.ackMode = 'never'`, `radio.unresponsive = true`, `transport.simulateDisconnect()`.
- Assert what went on the air through `radio.sent` (`wireText` for channels), refusals through
  `commandDenied`, and Companion commands issued (e.g. to check `radio.request()` or the flood-advert guard)
  through `radio.commands` (the codes sent, in order).
- A channel fixture needs `PUBLIC_CHANNEL_SECRET` (from `@meshcorejs/protocol`) as its `secret` to be seen as
  Public (`Channel.isPublic`); any other secret is an ordinary channel.
- Bot-level scenarios (a whole `load()` directory, simulated calendar time) belong in `@meshcorejs/testing`
  tests or the examples, not here.

## References

- Root `AGENTS.md` (repo conventions), `packages/protocol/AGENTS.md`, `packages/transports/AGENTS.md`,
  `packages/testing/AGENTS.md` (relies on the `@internal` hooks listed there), `examples/weather-bot/AGENTS.md`.
