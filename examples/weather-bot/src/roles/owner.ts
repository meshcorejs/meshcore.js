import { Permissions, RoleBuilder } from '@meshcorejs/client';
import { config } from '../config.js';

export default new RoleBuilder()
  .setName('owner')
  .setDescription('Bot owners')
  .setPriority(1000)
  .addPermissions(Permissions.Administrator)
  .setMembers(config.ownerKeys);
