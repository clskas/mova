import { SetMetadata } from '@nestjs/common';
import { AdminPermission } from '@mova/shared';

export const PERMISSIONS_KEY = 'admin_permissions';

export const RequirePermissions = (...permissions: AdminPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
