import type { OpenAILike } from '../src/options.js';

export interface Call {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_completion_tokens?: number;
}

export function fakeOpenAI(answers: Array<string | null>, error?: Error) {
  const calls: Call[] = [];
  let index = 0;
  const client = {
    chat: {
      completions: {
        create: async (params: Call) => {
          calls.push(params);
          if (error) throw error;
          const content = answers[index++] ?? null;
          return { choices: [{ message: { content } }] };
        },
      },
    },
  } as unknown as OpenAILike;
  return { client, calls };
}
