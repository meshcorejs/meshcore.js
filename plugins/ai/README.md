# @meshcorejs/plugin-ai

Ask an AI assistant from a MeshCore radio. `/ask <question>` in a DM, `@Bot ask <question>` on a channel,
answered in one or two sentences by an OpenAI-compatible model.

## Install

```bash
pnpm add @meshcorejs/plugin-ai
```

Needs `@meshcorejs/client` in the bot.

## Use

```ts
// plugins/ai.ts
import ai from '@meshcorejs/plugin-ai';

export default ai.configure({ apiKey: process.env.OPENAI_API_KEY ?? '' });
```

The bot loads it with the other bricks (`load: import.meta.dirname` in `main.ts`).

Another provider, and French replies:

```ts
import ai, { frenchReplies } from '@meshcorejs/plugin-ai';

export default ai.configure({
  apiKey: process.env.OPENROUTER_KEY ?? '',
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'mistralai/mistral-small',
  replies: frenchReplies,
});
```

## Options

| Option         | Default                | Role                                                                 |
| -------------- | ---------------------- | -------------------------------------------------------------------- |
| `apiKey`       | required               | The provider's API key. Read it from your own environment.           |
| `model`        | `gpt-5-mini`           | Model name.                                                          |
| `baseURL`      | OpenAI                 | Base URL of an OpenAI-compatible provider.                           |
| `systemPrompt` | see below              | Replaces the instruction. The bot's name is always appended.        |
| `cooldown`     | `30`                   | Seconds between two `/ask` by the same author.                       |
| `permission`   | none                   | Permission required to ask. Without it everyone can.                 |
| `history`      | `6`                    | Exchanges remembered per author. `0` disables memory.                |
| `historyTtl`   | `600`                  | Seconds before an author's memory is forgotten.                      |
| `maxParts`     | `2`                    | Radio messages an answer may take, 1 to 3.                           |
| `replies`      | English                | `frenchReplies`, or a partial override.                              |
| `openai`       |                        | Replaces the SDK client. For tests.                                  |

Default instruction: `You answer over a LoRa radio. Reply in one or two short sentences, plain text, no
markdown, no lists.`

Without `baseURL`, the `openai` SDK still applies its own environment fallbacks (`OPENAI_BASE_URL`,
`OPENAI_ORG_ID`, `OPENAI_PROJECT_ID`); the plugin itself never reads `process.env`.

## License

MIT
