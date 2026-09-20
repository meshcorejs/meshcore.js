import { CommandBuilder } from '@meshcorejs/client';

// #region args
export default new CommandBuilder()
  .setName('heard')
  .setDescription('Nodes heard recently')
  .addIntegerArg((arg) => arg.setName('hours').setDescription('How far back').setMin(1).setMax(48).setDefault(1))
  .addChoiceArg((arg) =>
    arg.setName('kind').setDescription('Node kind').setChoices('chat', 'repeater').setDefault('chat'),
  )
  .setHandler((ctx) => {
    // ctx.args is { hours: number; kind: 'chat' | 'repeater' }
    const since = Date.now() - ctx.args.hours * 3_600_000;
    const heard = ctx.client.contacts.cache.filter(
      (contact) => contact.type === ctx.args.kind && contact.lastSeen.getTime() > since,
    );
    return ctx.reply(`${heard.size} ${ctx.args.kind} nodes in the last ${ctx.args.hours}h`);
  });
// #endregion args
