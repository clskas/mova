import { UserRole } from './enums';

/** Permissions for admin panel endpoints (French labels in API docs). */
export enum AdminPermission {
  METRICS_READ = 'metrics:read',
  USERS_READ = 'users:read',
  USERS_WRITE = 'users:write',
  DRIVERS_READ = 'drivers:read',
  DRIVERS_WRITE = 'drivers:write',
  KYC_READ = 'kyc:read',
  KYC_WRITE = 'kyc:write',
  RIDES_READ = 'rides:read',
  RIDES_WRITE = 'rides:write',
  INCIDENTS_READ = 'incidents:read',
  INCIDENTS_WRITE = 'incidents:write',
  DELIVERIES_READ = 'deliveries:read',
  DELIVERIES_WRITE = 'deliveries:write',
  SCHEDULED_READ = 'scheduled:read',
  SCHEDULED_WRITE = 'scheduled:write',
  RESTAURANTS_READ = 'restaurants:read',
  RESTAURANTS_WRITE = 'restaurants:write',
  PRICING_READ = 'pricing:read',
  PRICING_WRITE = 'pricing:write',
  PROMO_READ = 'promo:read',
  PROMO_WRITE = 'promo:write',
  SUBSCRIPTIONS_READ = 'subscriptions:read',
  SUBSCRIPTIONS_WRITE = 'subscriptions:write',
  WALLETS_READ = 'wallets:read',
  WALLETS_WRITE = 'wallets:write',
}

export const ADMIN_PANEL_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.SUPPORT,
  UserRole.FINANCE,
  UserRole.CONTENT,
];

export function isAdminPanelRole(role: string): role is UserRole {
  return ADMIN_PANEL_ROLES.includes(role as UserRole);
}

/** Endpoint-level permission matrix by admin role. */
export const ADMIN_ROLE_PERMISSIONS: Record<UserRole, AdminPermission[]> = {
  [UserRole.PASSENGER]: [],
  [UserRole.DRIVER]: [],
  [UserRole.SUPER_ADMIN]: Object.values(AdminPermission),
  [UserRole.ADMIN]: [
    AdminPermission.METRICS_READ,
    AdminPermission.USERS_READ,
    AdminPermission.USERS_WRITE,
    AdminPermission.DRIVERS_READ,
    AdminPermission.DRIVERS_WRITE,
    AdminPermission.KYC_READ,
    AdminPermission.KYC_WRITE,
    AdminPermission.RIDES_READ,
    AdminPermission.RIDES_WRITE,
    AdminPermission.INCIDENTS_READ,
    AdminPermission.INCIDENTS_WRITE,
    AdminPermission.DELIVERIES_READ,
    AdminPermission.DELIVERIES_WRITE,
    AdminPermission.SCHEDULED_READ,
    AdminPermission.SCHEDULED_WRITE,
    AdminPermission.RESTAURANTS_READ,
    AdminPermission.RESTAURANTS_WRITE,
    AdminPermission.PRICING_READ,
    AdminPermission.PRICING_WRITE,
    AdminPermission.PROMO_READ,
    AdminPermission.PROMO_WRITE,
    AdminPermission.SUBSCRIPTIONS_READ,
    AdminPermission.SUBSCRIPTIONS_WRITE,
    AdminPermission.WALLETS_READ,
  ],
  [UserRole.SUPPORT]: [
    AdminPermission.METRICS_READ,
    AdminPermission.USERS_READ,
    AdminPermission.DRIVERS_READ,
    AdminPermission.KYC_READ,
    AdminPermission.KYC_WRITE,
    AdminPermission.RIDES_READ,
    AdminPermission.INCIDENTS_READ,
    AdminPermission.INCIDENTS_WRITE,
    AdminPermission.DELIVERIES_READ,
    AdminPermission.SCHEDULED_READ,
    AdminPermission.PRICING_READ,
  ],
  [UserRole.FINANCE]: [
    AdminPermission.METRICS_READ,
    AdminPermission.RIDES_READ,
    AdminPermission.PRICING_READ,
    AdminPermission.PRICING_WRITE,
    AdminPermission.PROMO_READ,
    AdminPermission.PROMO_WRITE,
    AdminPermission.SUBSCRIPTIONS_READ,
    AdminPermission.SUBSCRIPTIONS_WRITE,
    AdminPermission.WALLETS_READ,
    AdminPermission.WALLETS_WRITE,
  ],
  [UserRole.CONTENT]: [
    AdminPermission.RESTAURANTS_READ,
    AdminPermission.RESTAURANTS_WRITE,
    AdminPermission.PRICING_READ,
  ],
};

export function hasAdminPermission(role: string, permission: AdminPermission): boolean {
  if (!isAdminPanelRole(role)) return false;
  return ADMIN_ROLE_PERMISSIONS[role as UserRole].includes(permission);
}
