import { Permissions, RoleBuilder } from '@meshcorejs/client';

export default new RoleBuilder()
  .setName('admin')
  .setPriority(100)
  .addPermissions(Permissions.Administrator)
  .setMembers([]);
