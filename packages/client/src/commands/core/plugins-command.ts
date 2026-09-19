import { MessageBuilder } from '../../builders/message-builder.js';
import type { Client } from '../../client/client.js';
import { LoadError } from '../../errors.js';
import { Permissions } from '../../permissions/permission-builder.js';
import type { Plugin } from '../../plugins/plugin.js';
import { formatUsage } from '../command.js';
import { CommandBuilder } from '../command-builder.js';
import { HELPER_MAX_PARTS } from '../command-manager.js';

type Action = 'load' | 'unload' | 'reload';

async function apply(client: Client, plugin: Plugin, action: Action): Promise<string> {
  const replies = client.replies;
  try {
    switch (action) {
      case 'load':
        if (plugin.loaded) return replies.pluginAlreadyLoaded(plugin.name);
        await plugin.load();
        return replies.pluginLoaded(plugin.name, plugin.bricks.length);
      case 'unload':
        if (!plugin.loaded) return replies.pluginAlreadyUnloaded(plugin.name);
        await plugin.unload();
        return replies.pluginUnloaded(plugin.name);
      case 'reload':
        if (!plugin.loaded) return replies.pluginAlreadyUnloaded(plugin.name);
        await plugin.reload();
        return replies.pluginReloaded(plugin.name, plugin.bricks.length);
    }
  } catch (error) {
    if (!(error instanceof LoadError)) throw error;
    const first = error.issues[0];
    return replies.pluginFailed(plugin.name, first ? first.message : error.message);
  }
}

export function pluginsCommand(): CommandBuilder {
  return new CommandBuilder({ core: true })
    .setName('plugins')
    .setDescription('List, load, unload and reload plugins')
    .setScope('dm')
    .setRequiredPermissions(Permissions.ManagePlugins)
    .addChoiceArg((arg) => arg.setName('action').setChoices('load', 'unload', 'reload'))
    .addStringArg((arg) => arg.setName('name'))
    .setHandler(async (ctx) => {
      const { client } = ctx;
      const replies = client.replies;
      if (ctx.args.action === undefined) {
        const plugins = [...client.plugins.cache.values()];
        if (plugins.length === 0) return ctx.reply(replies.noPlugins);
        return ctx.reply(
          new MessageBuilder()
            .addLines(plugins.map((p) => replies.pluginLine(p.name, p.loaded, p.bricks.length)))
            .setOverflow('split', { maxParts: HELPER_MAX_PARTS }),
        );
      }
      if (ctx.args.name === undefined) {
        return ctx.reply(replies.usage(formatUsage(ctx.command, ctx.isDM, client.self.name)));
      }
      const plugin = client.plugins.get(ctx.args.name);
      if (!plugin) return ctx.reply(replies.unknownPlugin);
      return ctx.reply(await apply(client, plugin, ctx.args.action));
    });
}
