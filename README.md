# meshcore.js

[![CI](https://github.com/meshcorejs/meshcore.js/actions/workflows/ci.yml/badge.svg)](https://github.com/meshcorejs/meshcore.js/actions/workflows/ci.yml)
[![Docs](https://github.com/meshcorejs/meshcore.js/actions/workflows/docs.yml/badge.svg)](https://github.com/meshcorejs/meshcore.js/actions/workflows/docs.yml)
[![npm](https://img.shields.io/npm/v/@meshcorejs/client)](https://www.npmjs.com/package/@meshcorejs/client)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Plumber Score](https://score.getplumber.io/github.com/meshcorejs/meshcore.js.svg)](https://score.getplumber.io/github.com/meshcorejs/meshcore.js)

Build [MeshCore](https://github.com/meshcore-dev/MeshCore) bots:
a `Client` with events and caches, and one standard for every piece of a bot — commands, events, jobs,
permissions and roles — declared with builders.

> **Not the official client library.** [`meshcore-dev/meshcore.js`](https://github.com/meshcore-dev/meshcore.js)
> (`@liamcottle/meshcore.js`) is the low-level Companion protocol client used by MeshCore apps.
> This project is a **bot framework** with its own protocol layer.

## Install

```bash
pnpm add @meshcorejs/client serialport          # radio plugged over USB
pnpm add @meshcorejs/client                     # radio on WiFi (TCP)
pnpm add @meshcorejs/client @abandonware/noble  # radio over Bluetooth
```

Works with npm and yarn too. Node.js 20 or newer.

## Packages

| Package                                         | Purpose                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| [`@meshcorejs/client`](packages/client)         | The framework: client, managers, builders, plugins, permissions     |
| [`@meshcorejs/protocol`](packages/protocol)     | Companion Radio protocol codec, no I/O                              |
| [`@meshcorejs/transports`](packages/transports) | TCP, serial and BLE transports, plus a fake radio (`/mock`)         |
| [`@meshcorejs/testing`](packages/testing)       | Test bots without a radio: `createTestClient()` with simulated time |
| [`@meshcorejs/plugin-ai`](plugins/ai)           | Official plugin: `/ask <question>` answered by an AI model          |

Example: [`examples/weather-bot`](examples/weather-bot) (weather plugin, owner role, `RadioConfig`, morning
bulletin, tests).

## Documentation

Guides and the API reference on https://meshcore.js.org.

## Radio settings

Declare the radio's identity and LoRa settings once; `login()` applies what differs and refuses to start if the
radio cannot honour it:

```ts
const client = new Client({
  transport: new SerialTransport({ path: '/dev/ttyACM0' }),
  radio: new RadioConfig({ name: 'TrainBot', txPower: 22, params: { frequency: 869.525, bandwidth: 250, spreadingFactor: 11, codingRate: 5 } }),
});
```

## Plugins

Group bricks that live together, ship them as a package, configure them at the client:

```ts
import ai from '@meshcorejs/plugin-ai';

client.register(ai.configure({ apiKey: process.env.OPENAI_API_KEY ?? '' }));
await client.login();
await client.plugins.get('ai')?.reload();
```

Official plugins are published under `@meshcorejs/plugin-*`; your own can live anywhere, even in the bot's
own `plugins/` folder.

## Replies and built-in commands

Everything the bot says on its own is English by default and overridable:

```ts
import { frenchReplies } from '@meshcorejs/client';
new Client({ transport, replies: frenchReplies }); // or { unknownCommandDM: '…' }
```

Holders of `Permissions.ManagePlugins` / `ManageJobs` (or `Administrator`) get `/plugins [load|unload|reload <name>]`
and `/jobs [run|pause|resume <name>]` in DM. Bots without roles expose nothing extra.

## Anti-spam by default

A bot built with meshcore.js cannot spam the mesh by accident:

- it never speaks first on **Public**, and only answers commands you allowed there with `setScope('public')`;
- on a channel it only speaks to answer a command it ran — refusals are silent;
- at most **10 messages per 5 minutes** on one channel, **one flood advert per 30 minutes**;
- `maxHops` bounds how far it answers.

None of this is configurable; see [A well-behaved bot](https://meshcore.js.org/docs/client/guides/a-well-behaved-bot).

## Requirements

- A MeshCore node running the **Companion Radio** firmware (protocol version 3 or newer).
- Node.js 20+ to run bots; Node.js 22.12+ and pnpm 11 to work on this repository.
- Serial: `pnpm add serialport`. BLE: `pnpm add @abandonware/noble`. TCP needs nothing.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm check              # Biome: format + lint + import order
pnpm check:publish      # publint
pnpm knip               # unused code and dependencies
pnpm check:types
```

Contributions go through pull requests, see [CONTRIBUTING.md](CONTRIBUTING.md). Releases use
[Changesets](.changeset/README.md) and are published to npm by CI.
