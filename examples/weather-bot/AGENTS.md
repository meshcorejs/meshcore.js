# weather-bot — agent guide

## Purpose

The example bot: a configurable weather plugin whose service instance is shared with a morning job, an owner
role that unlocks the built-in `/plugins` and `/jobs`, `RadioConfig`, a welcome event and an integration test
with `@meshcorejs/testing`. Private workspace package, English throughout (default `englishReplies`).

- Depends on: `@meshcorejs/client` (workspace), `serialport`. Dev: `@meshcorejs/testing`, `tsx`.
- Used by: nobody, it is documentation that compiles, runs and is tested.

## Layout

```
src/
  main.ts                 Client { SerialTransport, radio: RadioConfig({ name: 'WeatherBot', location }), load: import.meta.dirname }, diagnostic logs
  config.ts               env → channel, location, timezone, ownerKeys (read once at import)
  weather-plugin/index.ts "the package": WeatherService class (Open-Meteo forecast + geocoding), PluginBuilder<{ weather }> adding /weather [city], weatherIcon()
  weather.ts              export const weather = new WeatherService({ location, timezone }), the shared instance
  plugins/weather.ts      export default weatherPlugin.configure({ weather })   ← what load() picks up
  roles/owner.ts          priority 1000, Administrator, members OWNER_KEYS
  events/welcome.ts       contactAdd → DM to chat contacts
  jobs/bulletin.ts        cron 07:00 in the configured time zone → channel, two-day forecast from the shared service
```

## Public API

None (application). Scripts: `pnpm dev` (`tsx watch --env-file=.env src/main.ts`), `pnpm build` + `pnpm start`
(`node --env-file=.env dist/main.js`), `pnpm typecheck`. `.env` is loaded by Node's `--env-file` (Node 20.6+).

## Rules

- Keep it small: one plugin, one job, one event, one role. A new framework feature earns a line here only if it
  is small.
- Bricks live in the conventional folders and `export default` a builder. Non-brick modules (`weather-plugin/`,
  `weather.ts`, `config.ts`) live outside the six scanned folders so `load()` ignores them.
- Sharing a service between a plugin and the bot is the bot's business, not the library's: the plugin takes the
  `WeatherService` instance in its options (`configure({ weather })`), the job imports the same instance.
- `.env` values starting with `#` must be quoted (`WEATHER_BOT_CHANNEL="#weather"`), Node's `--env-file` reads an
  unquoted `#` as a comment. `config.ts` uses `||` so an empty value falls back to the default.
- `config.ts` reads the environment at import time: the test sets `OWNER_KEYS` before `createTestClient()`
  imports the bricks.

## References

- Root `AGENTS.md`, `packages/client/AGENTS.md` (framework rules), `packages/testing/AGENTS.md`.
