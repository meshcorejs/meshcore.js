// #region test
import { createTestClient } from '@meshcorejs/testing';
import { afterEach, expect, it } from 'vitest';

const bots: Array<{ destroy(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(bots.map((bot) => bot.destroy()));
});

it('lets an owner post on the channel', async () => {
  const bot = await createTestClient({ load: import.meta.dirname, now: '2026-09-20T18:00:00Z' });
  bots.push(bot);

  const alice = bot.fakeContact('Alice');
  bot.fakeChannel('#club');
  bot.setRoleMembers('owner', [alice]);

  expect(await bot.dm(alice, '/announce Meeting at 19:00')).toEqual(['Posted']);
  expect(bot.sentTo('#club')).toEqual(['Meeting at 19:00']);
});

it('refuses everyone else', async () => {
  const bot = await createTestClient({ load: import.meta.dirname });
  bots.push(bot);

  expect(await bot.dm(bot.fakeContact('Bob'), '/announce free beer')).toEqual(['⛔ Permission denied']);
});
// #endregion test
