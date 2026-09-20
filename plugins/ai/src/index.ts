import { type Client, PluginBuilder } from '@meshcorejs/client';
import OpenAI from 'openai';
import { askCommand } from './ask.js';
import { History } from './history.js';
import { type AiDeps, type AiOptions, DEFAULTS } from './options.js';
import { mergeReplies } from './replies.js';

export { History, type Turn } from './history.js';
export type { AiDeps, AiOptions, OpenAILike } from './options.js';
export { englishReplies, frenchReplies, mergeReplies, type Replies } from './replies.js';

/**
 * Validates the options and builds what the bricks share. Runs at every load and reload.
 * @param client Owning client
 * @param options Options given to `configure()`
 */
export function createDeps(client: Client, options: AiOptions): AiDeps {
  const problems: string[] = [];
  if (!options.openai && !options.apiKey) problems.push('apiKey is required');
  const cooldown = options.cooldown ?? DEFAULTS.cooldown;
  const history = options.history ?? DEFAULTS.history;
  const historyTtl = options.historyTtl ?? DEFAULTS.historyTtl;
  const maxParts = options.maxParts ?? DEFAULTS.maxParts;
  if (cooldown < 0) problems.push('cooldown must be 0 or more');
  if (history < 0) problems.push('history must be 0 or more');
  if (historyTtl < 0) problems.push('historyTtl must be 0 or more');
  if (!Number.isInteger(maxParts) || maxParts < 1 || maxParts > 3) problems.push('maxParts must be 1, 2 or 3');
  if (problems.length > 0) throw new RangeError(problems.join(', '));

  return {
    openai:
      options.openai ??
      new OpenAI({ apiKey: options.apiKey, ...(options.baseURL ? { baseURL: options.baseURL } : {}) }),
    history: new History(history, historyTtl * 1000),
    replies: mergeReplies(options.replies),
    model: options.model ?? DEFAULTS.model,
    systemPrompt: `${options.systemPrompt ?? DEFAULTS.systemPrompt} You are ${client.self.name}.`,
    cooldown,
    maxParts,
  };
}

export default new PluginBuilder<AiOptions>()
  .setName('ai')
  .setDescription('Ask an AI assistant from the radio')
  .setBricks((client, options) => {
    const deps = createDeps(client, options);
    return [askCommand(client, deps, options.permission)];
  });
