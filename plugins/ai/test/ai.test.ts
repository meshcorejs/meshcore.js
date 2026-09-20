import { type Brick, Permissions, RoleBuilder } from '@meshcorejs/client';
import { createTestClient, type TestBot } from '@meshcorejs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import ai, { type AiOptions, frenchReplies } from '../src/index.js';
import { fakeOpenAI } from './fake-openai.js';

const bots: TestBot[] = [];
afterEach(async () => {
  await Promise.all(bots.splice(0).map((bot) => bot.destroy()));
});

function registerAndLoad(bot: TestBot, brick: Brick): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      bot.client.off('pluginLoad', onLoad);
      bot.client.off('error', onError);
    };
    const onLoad = () => {
      done();
      resolve();
    };
    const onError = (error: Error) => {
      done();
      reject(error);
    };
    bot.client.on('pluginLoad', onLoad);
    bot.client.on('error', onError);
    bot.client.register(brick);
  });
}

async function setup(
  options: Partial<AiOptions> = {},
  answers: Array<string | null> = ['Toulouse is in the south-west of France.'],
) {
  const openai = fakeOpenAI(answers);
  const bot = await createTestClient({ self: { name: 'ClubBot' } });
  bots.push(bot);
  await registerAndLoad(bot, ai.configure({ apiKey: 'test', openai: openai.client, ...options }));
  return { bot, ...openai };
}

describe('/ask', () => {
  it('answers in a DM', async () => {
    const { bot } = await setup();
    expect(await bot.dm(bot.fakeContact('Alice'), '/ask where is Toulouse')).toEqual([
      'Toulouse is in the south-west of France.',
    ]);
  });

  it('answers on a channel with the @Bot form', async () => {
    const { bot } = await setup();
    bot.fakeChannel('#club');
    expect(await bot.channel('#club', 'Alice', '@ClubBot ask where is Toulouse')).toEqual([
      '@[Alice] Toulouse is in the south-west of France.',
    ]);
  });

  it('sends the system prompt with the bot name, then the author history', async () => {
    const { bot, calls } = await setup({}, ['A1', 'A2']);
    const alice = bot.fakeContact('Alice');
    await bot.dm(alice, '/ask q1');
    await bot.advanceTime('31s');
    await bot.dm(alice, '/ask q2');
    expect(calls[0]?.model).toBe('gpt-5-mini');
    expect(calls[0]?.max_completion_tokens).toBe(120);
    expect(calls[0]?.messages).toEqual([
      {
        role: 'system',
        content:
          'You answer over a LoRa radio. Reply in one or two short sentences, plain text, no markdown, no lists. You are ClubBot.',
      },
      { role: 'user', content: 'q1' },
    ]);
    expect(calls[1]?.messages.slice(1)).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'q2' },
    ]);
  });

  it('forgets the history after historyTtl', async () => {
    const { bot, calls } = await setup({ historyTtl: 60 }, ['A1', 'A2']);
    const alice = bot.fakeContact('Alice');
    await bot.dm(alice, '/ask q1');
    await bot.advanceTime('2m');
    await bot.dm(alice, '/ask q2');
    expect(calls[1]?.messages.slice(1)).toEqual([{ role: 'user', content: 'q2' }]);
  });

  it('splits a long answer in two parts at most', async () => {
    const long = 'word '.repeat(80).trim();
    const { bot } = await setup({}, [long]);
    const parts = await bot.dm(bot.fakeContact('Alice'), '/ask tell me more');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^word( word)+ 1\/2$/);
    expect(parts[1]).toMatch(/ 2\/2$/);
  });

  it('answers unavailable when the model fails, and keeps the history intact', async () => {
    const openai = fakeOpenAI([], new Error('boom'));
    const bot = await createTestClient({ self: { name: 'ClubBot' } });
    bots.push(bot);
    await registerAndLoad(bot, ai.configure({ apiKey: 'test', openai: openai.client }));
    const alice = bot.fakeContact('Alice');
    expect(await bot.dm(alice, '/ask q1')).toEqual(['⚠️ The assistant is unavailable, try again later']);
    expect(openai.calls[0]?.messages.slice(1)).toEqual([{ role: 'user', content: 'q1' }]);
  });

  it('answers unavailable on an empty completion', async () => {
    const { bot } = await setup({}, [null]);
    expect(await bot.dm(bot.fakeContact('Alice'), '/ask q1')).toEqual([
      '⚠️ The assistant is unavailable, try again later',
    ]);
  });

  it('refuses without the permission and accepts with it', async () => {
    const { bot } = await setup({ permission: Permissions.Administrator });
    bot.client.register(
      new RoleBuilder().setName('owner').setPriority(10).addPermissions(Permissions.Administrator).setMembers([]),
    );
    const alice = bot.fakeContact('Alice');
    const bob = bot.fakeContact('Bob');
    bot.setRoleMembers('owner', [alice]);
    expect(await bot.dm(bob, '/ask q')).toEqual(['⛔ Permission denied']);
    expect(await bot.dm(alice, '/ask q')).toEqual(['Toulouse is in the south-west of France.']);
  });

  it('speaks French with frenchReplies', async () => {
    const { bot } = await setup({ replies: frenchReplies }, [null]);
    expect(await bot.dm(bot.fakeContact('Alice'), '/ask q')).toEqual([
      "⚠️ L'assistant est indisponible, réessaie plus tard",
    ]);
  });

  it('enforces the cooldown', async () => {
    const { bot } = await setup({}, ['A1', 'A2']);
    const alice = bot.fakeContact('Alice');
    await bot.dm(alice, '/ask q1');
    expect(await bot.dm(alice, '/ask q2')).toEqual(['⏳ Try again in 30s']);
  });

  it('rejects invalid options at load', async () => {
    const bot = await createTestClient();
    bots.push(bot);
    await expect(registerAndLoad(bot, ai.configure({ apiKey: '', maxParts: 5 }))).rejects.toThrow(/apiKey.*maxParts/s);
    expect(bot.client.plugins.get('ai')?.state).toBe('pending');
    expect(await bot.dm(bot.fakeContact('Alice'), '/ask q')).toEqual(['❓ Unknown command, /help']);
  });
});
