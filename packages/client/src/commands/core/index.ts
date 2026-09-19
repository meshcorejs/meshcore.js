import type { CommandBuilder } from '../command-builder.js';
import { jobsCommand } from './jobs-command.js';
import { pluginsCommand } from './plugins-command.js';

export function coreCommands(): CommandBuilder[] {
  return [pluginsCommand(), jobsCommand()];
}
