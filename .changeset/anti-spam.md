---
"@meshcorejs/protocol": minor
"@meshcorejs/client": minor
"@meshcorejs/testing": patch
---

Anti-spam guards, on by default and not configurable:

- Commands ignore the Public channel unless they opt in with `setScope('public')` (`CommandScope` gains `'public'`); `channel.send()` and `message.reply()` on Public reject with `PublicChannelError`. `Channel.isPublic`, `PUBLIC_CHANNEL_SECRET`.
- On a channel every refusal is silent (`commandDenied` only) and `@Bot` answers one line (`Replies.helperChannel`). **Breaking:** `Replies.unknownCommandChannel` and `Replies.channelUntrusted` are removed.
- 10 parts per 5 minutes per channel (`CHANNEL_SEND_LIMIT`, `CHANNEL_SEND_WINDOW_MS`), one flood advert per 30 minutes (`ADVERT_FLOOD_INTERVAL_MS`); both reject with `RateLimitError`.
- `new Client({ maxHops })`: commands from further away are ignored (`commandDenied` `tooFar`), `message.reply()` rejects with `TooFarError`.
- `client.radio.request(code, payload, collect?)` sends an unwrapped Companion command through the request queue; the three mesh-transmitting commands are refused (`GuardedCommandError`). `expectType` and `Collector` are exported.
