// #region owner
import { Client, Permissions, RoleBuilder, SerialTransport } from '@meshcorejs/client';

const client = new Client({ transport: new SerialTransport({ path: '/dev/ttyACM0' }) });

client.register(
  new RoleBuilder()
    .setName('owner')
    .setDescription('Bot owners')
    .setPriority(1000)
    .addPermissions(Permissions.Administrator)
    .setMembers((process.env.OWNER_KEYS ?? '').split(',').filter(Boolean)),
);
// #endregion owner

// #region source
async function moderatorKeys(): Promise<string[]> {
  return []; // query your own storage
}

client.register(new RoleBuilder().setName('moderator').setPriority(10).setMembers(moderatorKeys, { cacheTtl: 60 }));

// after moderators change in your own storage
client.roles.get('moderator')?.invalidate();

// #endregion source

// #region custom
import { CommandBuilder, PermissionBuilder } from '@meshcorejs/client';

const trainAlert = new PermissionBuilder().setName('train.alert').setDescription('Broadcast a traffic alert');

client.register([
  trainAlert,
  new RoleBuilder()
    .setName('alerts')
    .setPriority(20)
    .addPermissions(trainAlert)
    .setMembers(moderatorKeys, { cacheTtl: 60 }),
  new CommandBuilder()
    .setName('alert')
    .setDescription('Broadcast a traffic alert')
    .addStringArg((arg) => arg.setName('text').setRequired().setRest())
    .setRequiredPermissions(trainAlert)
    .setHandler(async (ctx) => {
      const channel = ctx.client.channels.get('#lyon');
      if (!channel) return ctx.reply('Channel #lyon is not on the radio');
      await channel.send(ctx.args.text);
      await ctx.reply('Broadcast sent');
    }),
]);
// #endregion custom
