# weather-bot

Example meshcore.js bot: Open-Meteo forecasts (no API key) on demand with `/weather`, and every morning on a
channel. Shows `RadioConfig`, a configurable plugin whose service is shared with a job, an owner role that
unlocks the built-in `/plugins` and `/jobs`, and a test with `@meshcorejs/testing`.

```bash
cp .env.example .env    # MESH_SERIAL, WEATHER_LAT/LON, WEATHER_BOT_CHANNEL, OWNER_KEYS
pnpm dev                # tsx watch, hot reload of bricks
pnpm build && pnpm start
```

On the radio:

```
DM       /weather  ·  /weather Luchon     two-day forecast here or in a city
channel  @WeatherBot weather              same, mention instead of /
DM       /plugins reload weather  ·  /jobs run bulletin   owners (built-in commands)
```
