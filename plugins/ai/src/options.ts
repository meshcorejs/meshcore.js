import type { PermissionLike } from '@meshcorejs/client';
import type OpenAI from 'openai';
import type { History } from './history.js';
import type { Replies } from './replies.js';

export type OpenAILike = Pick<OpenAI, 'chat'>;

export interface AiOptions {
  /** OpenAI API key, or the key of a compatible provider. Read it from your own environment. */
  apiKey: string;
  /** Model name. Default `gpt-5-mini`. */
  model?: string;
  /** Base URL of an OpenAI-compatible provider (OpenRouter, Mistral, Ollama, …). */
  baseURL?: string;
  /** Replaces the default instruction; the bot's name is always appended. */
  systemPrompt?: string;
  /** Seconds between two `/ask` by the same author. Default 30. */
  cooldown?: number;
  /** Permission required to use `/ask`. None by default: everyone can ask. */
  permission?: PermissionLike;
  /** Exchanges remembered per author. Default 6. `0` disables memory. */
  history?: number;
  /** Seconds before an author's memory is forgotten. Default 600. */
  historyTtl?: number;
  /** Radio messages an answer may take, 1 to 3. Default 2. */
  maxParts?: number;
  /** Texts the plugin says on its own: a preset or a partial override. */
  replies?: Partial<Replies>;
  /** Replaces the client built from `apiKey` and `baseURL`. For tests. */
  openai?: OpenAILike;
}

export interface AiDeps {
  openai: OpenAILike;
  history: History;
  replies: Replies;
  model: string;
  systemPrompt: string;
  cooldown: number;
  maxParts: number;
}

export const DEFAULTS = Object.freeze({
  model: 'gpt-5-mini',
  cooldown: 30,
  history: 6,
  historyTtl: 600,
  maxParts: 2,
  systemPrompt: 'You answer over a LoRa radio. Reply in one or two short sentences, plain text, no markdown, no lists.',
  maxCompletionTokens: 120,
  timeoutMs: 20_000,
});
