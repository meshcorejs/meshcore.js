import { CommandBuilder } from '../../../../src/index.js';

export default new CommandBuilder()
  .setName('departs')
  .addIntegerArg((a) => a.setName('nombre').setDefault(3))
  .addStringArg((a) => a.setName('gare').setRequired(true).setRest(true))
  .setHandler(() => {});
