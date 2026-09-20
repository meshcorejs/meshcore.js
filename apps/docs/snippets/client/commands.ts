import { CommandBuilder } from '@meshcorejs/client';

// #region basic
export default new CommandBuilder()
  .setName('heard')
  .setDescription('Nodes heard in the last hour')
  .addAliases('who')
  .setHandler((ctx) => ctx.reply(`${ctx.client.contacts.cache.size} contacts on the radio`));
// #endregion basic

// #region args
export const forecast = new CommandBuilder()
  .setName('forecast')
  .setDescription('Weather forecast for a city')
  .addStringArg((arg) => arg.setName('city').setDescription('City name').setDefault('here'))
  .addIntegerArg((arg) => arg.setName('days').setDescription('Days ahead').setMin(1).setMax(5).setDefault(2))
  .addChoiceArg((arg) => arg.setName('unit').setDescription('Temperature unit').setChoices('c', 'f').setDefault('c'))
  .setHandler((ctx) => {
    // ctx.args is inferred as { city: string; days: number; unit: 'c' | 'f' }
    return ctx.reply(`${ctx.args.city}, ${ctx.args.days}d, °${ctx.args.unit.toUpperCase()}`);
  });
// #endregion args
