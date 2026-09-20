import { UserRole } from './enums';

/** Permissions for admin panel endpoints (French labels in API docs). */
export enum AdminPermission {
  METRICS_READ = 'metrics:read',
  USERS_READ = 'users:read',
  USERS_WRITE = 'users:write',
  USERS_DELETE = 'users:delete',
  DRIVERS_READ = 'drivers:read',
  DRIVERS_WRITE = 'drivers:write',
  KYC_READ = 'kyc:read',
  KYC_WRITE = 'kyc:write',
  RIDES_READ = 'rides:read',
  RIDES_WRITE = 'rides:write',
  INCIDENTS_READ = 'incidents:read',
  INCIDENTS_WRITE = 'incidents:write',
  FRAUD_READ = 'fraud:read',
  FRAUD_WRITE = 'fraud:write',
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
  PUBLICITES_READ = 'publicites:read',
  PUBLICITES_WRITE = 'publicites:write',
  CONTACTS_READ = 'contacts:read',
  CONTACTS_WRITE = 'contacts:write',
  CGU_READ = 'cgu:read',
  CGU_WRITE = 'cgu:write',
  /** SuperAdmin-only: maintenance mode + MM operator visibility. */
  SYSTEM_READ = 'system:read',
  SYSTEM_WRITE = 'system:write',
}

export const ADMIN_PANEL_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.SUPPORT,
  UserRole.FINANCE,
  UserRole.CONTENT,
  UserRole.CITY_ADMIN,
];

export function isAdminPanelRole(role: string): role is UserRole {
  return ADMIN_PANEL_ROLES.includes(role as UserRole);
}

/** Endpoint-level permission matrix by admin role. */
export const ADMIN_ROLE_PERMISSIONS: Record<UserRole, AdminPermission[]> = {
  [UserRole.PASSENGER]: [],
  [UserRole.DRIVER]: [],
  [UserRole.RESTAURANT]: [],
  [UserRole.RENTAL_PARTNER]: [],
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
    AdminPermission.FRAUD_READ,
    AdminPermission.FRAUD_WRITE,
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
    AdminPermission.PUBLICITES_READ,
    AdminPermission.PUBLICITES_WRITE,
    AdminPermission.CONTACTS_READ,
    AdminPermission.CONTACTS_WRITE,
    AdminPermission.CGU_READ,
    AdminPermission.CGU_WRITE,
  ],
  [UserRole.SUPPORT]: [
    AdminPermission.METRICS_READ,
    AdminPermission.USERS_READ,
    AdminPermission.DRIVERS_READ,
    AdminPermission.KYC_READ,
    AdminPermission.KYC_WRITE,
    AdminPermission.RIDES_READ,
    AdminPermission.RIDES_WRITE,
    AdminPermission.INCIDENTS_READ,
    AdminPermission.INCIDENTS_WRITE,
    AdminPermission.FRAUD_READ,
    AdminPermission.DELIVERIES_READ,
    AdminPermission.DELIVERIES_WRITE,
    AdminPermission.SCHEDULED_READ,
    AdminPermission.SCHEDULED_WRITE,
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
    AdminPermission.SCHEDULED_READ,
    AdminPermission.SCHEDULED_WRITE,
    AdminPermission.PUBLICITES_READ,
    AdminPermission.PUBLICITES_WRITE,
  ],
  /** City-scoped ops: tarifs ville, chauffeurs/KYC/partenaires, dashboard — pas system/wallets. */
  [UserRole.CITY_ADMIN]: [
    AdminPermission.METRICS_READ,
    AdminPermission.USERS_READ,
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
    AdminPermission.RESTAURANTS_READ,
    AdminPermission.RESTAURANTS_WRITE,
    AdminPermission.SCHEDULED_READ,
    AdminPermission.PRICING_READ,
    AdminPermission.PRICING_WRITE,
  ],
};

/** Niveaux d’accès UI (cases à cocher super-admin) → permissions API. */
export type AdminAccessLevel = {
  id: string;
  label: string;
  permissions: AdminPermission[];
};

export const ADMIN_ACCESS_LEVELS: AdminAccessLevel[] = [
  { id: 'dashboard', label: 'Tableau de bord', permissions: [AdminPermission.METRICS_READ] },
  {
    id: 'utilisateurs',
    label: 'Utilisateurs',
    permissions: [AdminPermission.USERS_READ, AdminPermission.USERS_WRITE, AdminPermission.USERS_DELETE],
  },
  {
    id: 'chauffeurs',
    label: 'Chauffeurs',
    permissions: [AdminPermission.DRIVERS_READ, AdminPermission.DRIVERS_WRITE],
  },
  { id: 'kyc', label: 'KYC', permissions: [AdminPermission.KYC_READ, AdminPermission.KYC_WRITE] },
  { id: 'courses', label: 'Courses', permissions: [AdminPermission.RIDES_READ, AdminPermission.RIDES_WRITE] },
  {
    id: 'livraisons',
    label: 'Livraisons',
    permissions: [AdminPermission.DELIVERIES_READ, AdminPermission.DELIVERIES_WRITE],
  },
  {
    id: 'restaurants',
    label: 'Restaurants / partenaires',
    permissions: [AdminPermission.RESTAURANTS_READ, AdminPermission.RESTAURANTS_WRITE],
  },
  {
    id: 'tarifs',
    label: 'Tarifs & règles',
    permissions: [AdminPermission.PRICING_READ, AdminPermission.PRICING_WRITE],
  },
  {
    id: 'litiges',
    label: 'Litiges / SOS',
    permissions: [AdminPermission.INCIDENTS_READ, AdminPermission.INCIDENTS_WRITE],
  },
  { id: 'fraude', label: 'Fraude', permissions: [AdminPermission.FRAUD_READ, AdminPermission.FRAUD_WRITE] },
  {
    id: 'planifiees',
    label: 'Planifiées / locations / covoiturage',
    permissions: [AdminPermission.SCHEDULED_READ, AdminPermission.SCHEDULED_WRITE],
  },
  {
    id: 'abonnements',
    label: 'Abonnements & promos',
    permissions: [
      AdminPermission.SUBSCRIPTIONS_READ,
      AdminPermission.SUBSCRIPTIONS_WRITE,
      AdminPermission.PROMO_READ,
      AdminPermission.PROMO_WRITE,
    ],
  },
  {
    id: 'portefeuille',
    label: 'Portefeuille',
    permissions: [AdminPermission.WALLETS_READ, AdminPermission.WALLETS_WRITE],
  },
  {
    id: 'publicites',
    label: 'Publicités',
    permissions: [AdminPermission.PUBLICITES_READ, AdminPermission.PUBLICITES_WRITE],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    permissions: [AdminPermission.CONTACTS_READ, AdminPermission.CONTACTS_WRITE],
  },
  { id: 'cgu', label: 'CGU', permissions: [AdminPermission.CGU_READ, AdminPermission.CGU_WRITE] },
  {
    id: 'systeme',
    label: 'Système (maintenance, MM, SOS ops)',
    permissions: [AdminPermission.SYSTEM_READ, AdminPermission.SYSTEM_WRITE],
  },
];

const ALL_PERMISSION_VALUES = new Set<string>(Object.values(AdminPermission));

export function sanitizeAdminPermissions(raw?: string[] | null): AdminPermission[] {
  if (!raw?.length) return [];
  const out: AdminPermission[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    const key = String(p ?? '').trim();
    if (!ALL_PERMISSION_VALUES.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key as AdminPermission);
  }
  return out;
}

/** Permissions effectives : override explicite, sinon matrice du rôle. */
export function resolveAdminPermissions(
  role: string,
  overrides?: string[] | null,
): AdminPermission[] {
  if (!isAdminPanelRole(role)) return [];
  const custom = sanitizeAdminPermissions(overrides);
  if (custom.length > 0) return custom;
  return [...(ADMIN_ROLE_PERMISSIONS[role as UserRole] ?? [])];
}

export function hasAdminPermission(
  role: string,
  permission: AdminPermission,
  overrides?: string[] | null,
): boolean {
  return resolveAdminPermissions(role, overrides).includes(permission);
}

/** Cases cochées par défaut pour un rôle (niveaux dont au moins 1 permission est accordée). */
export function defaultAccessLevelIdsForRole(role: string): string[] {
  const perms = new Set(resolveAdminPermissions(role, null));
  return ADMIN_ACCESS_LEVELS.filter((level) => level.permissions.some((p) => perms.has(p))).map(
    (level) => level.id,
  );
}

/** Convertit les niveaux cochés en liste de permissions à persister. */
export function permissionsFromAccessLevelIds(levelIds: string[]): AdminPermission[] {
  const wanted = new Set(levelIds);
  const out: AdminPermission[] = [];
  const seen = new Set<string>();
  for (const level of ADMIN_ACCESS_LEVELS) {
    if (!wanted.has(level.id)) continue;
    for (const p of level.permissions) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/** true si la liste custom est identique aux défauts du rôle (→ stocker []). */
export function permissionsMatchRoleDefaults(role: string, permissions: string[]): boolean {
  const a = new Set(resolveAdminPermissions(role, null));
  const b = new Set(sanitizeAdminPermissions(permissions));
  if (a.size !== b.size) return false;
  for (const p of a) if (!b.has(p)) return false;
  return true;
}

/** Sections menu admin dérivées des permissions effectives. */
export function accessLevelIdsFromPermissions(permissions: string[]): string[] {
  const perms = new Set(sanitizeAdminPermissions(permissions));
  return ADMIN_ACCESS_LEVELS.filter((level) => level.permissions.some((p) => perms.has(p))).map(
    (level) => level.id,
  );
}
