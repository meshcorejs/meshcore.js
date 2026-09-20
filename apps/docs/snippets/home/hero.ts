import { CommandBuilder, MessageBuilder } from '@meshcorejs/client';

export default new CommandBuilder()
  .setName('heard')
  .setDescription('Nodes heard in the last hour')
  .setHandler((ctx) => {
    const since = Date.now() - 3_600_000;
    const heard = ctx.client.contacts.cache.filter((contact) => contact.lastSeen.getTime() > since);
    return ctx.reply(
      new MessageBuilder()
        .setTitle(`📡 ${heard.size} heard`)
        .addLines(heard.toArray().map((contact) => contact.name))
        .setOverflow('truncate'),
    );
  });
