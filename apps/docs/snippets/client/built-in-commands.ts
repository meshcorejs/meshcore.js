import { Permissions, RoleBuilder } from '@meshcorejs/client';

// #region owner
export default new RoleBuilder()
  .setName('owner')
  .setDescription('Bot owners')
  .setPriority(1000)
  .addPermissions(Permissions.Administrator)
  .setMembers(['a1b2c3d4e5f6']);
// #endregion owner
