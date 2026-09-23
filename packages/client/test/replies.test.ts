import { MockTransport } from '@meshcorejs/transports/mock';
import { describe, expect, it } from 'vitest';
import { Client } from '../src/client/client.js';
import { englishReplies, frenchReplies, mergeReplies, Replies } from '../src/commands/replies.js';
import { silentLogger } from '../src/logger.js';

describe('Replies presets', () => {
  it('defaults to English and keeps the French texts of the v1 spec', () => {
    expect(Replies).toBe(englishReplies);
    expect(englishReplies.unknownCommandDM).toBe('❓ Unknown command, /help');
    expect(englishReplies.missingPermissions).toBe('⛔ Permission denied');
    expect(englishReplies.cooldown(20)).toBe('⏳ Try again in 20s');
    expect(englishReplies.invalidArgument('numero', '/train <numero>')).toBe('⚠️ numero is invalid\n/train <numero>');
    expect(frenchReplies.unknownCommandDM).toBe('❓ Commande inconnue, /help');
    expect(frenchReplies.helperChannel(['train'])).toBe('Commandes : train · /help en DM');
    expect(frenchReplies.cooldown(20)).toBe('⏳ Réessaie dans 20s');
    expect(frenchReplies.invalidArgument('numero', '/train <numero>')).toBe('⚠️ numero invalide\n/train <numero>');
  });

  it('both presets define every key', () => {
    expect(Object.keys(frenchReplies).sort()).toEqual(Object.keys(englishReplies).sort());
    expect(Object.isFrozen(englishReplies)).toBe(true);
  });

  it('merges a partial override over the English defaults', () => {
    const replies = mergeReplies({ unknownCommandDM: '❓ Nope, /help' });
    expect(replies.unknownCommandDM).toBe('❓ Nope, /help');
    expect(replies.missingPermissions).toBe('⛔ Permission denied');
    expect(mergeReplies().cooldown(3)).toBe('⏳ Try again in 3s');
  });
});

describe('Client.replies', () => {
  it('exposes the merged replies and accepts a whole preset', () => {
    const transport = new MockTransport();
    const english = new Client({ transport, logger: silentLogger });
    expect(english.replies.noCommands).toBe('No commands available');
    const french = new Client({ transport, logger: silentLogger, replies: frenchReplies });
    expect(french.replies.noCommands).toBe('Aucune commande disponible');
    const mixed = new Client({
      transport,
      logger: silentLogger,
      replies: { ...frenchReplies, missingPermissions: '⛔ Non.' },
    });
    expect(mixed.replies.missingPermissions).toBe('⛔ Non.');
    expect(mixed.replies.unknownCommandDM).toBe('❓ Commande inconnue, /help');
    expect(Object.isFrozen(mixed.replies)).toBe(true);
  });
});
