/** Client apps that can be toggled for MM visibility / maintenance. */
export const CLIENT_APP_IDS = ['senga', 'senga_driver', 'resto', 'location'] as const;
export type ClientAppId = (typeof CLIENT_APP_IDS)[number];

export const MM_OPERATOR_IDS = ['ORANGE_MONEY', 'MPESA', 'AIRTEL_MONEY'] as const;
export type MmOperatorId = (typeof MM_OPERATOR_IDS)[number];

export type MmVisibilityByApp = Record<ClientAppId, Record<MmOperatorId, boolean>>;

export type MaintenanceConfig = {
  messageFr: string;
  apps: Record<ClientAppId, boolean>;
};

export type ClientAppsConfig = {
  mobileMoney: MmVisibilityByApp;
  maintenance: MaintenanceConfig;
};

export const DEFAULT_MAINTENANCE_MESSAGE_FR =
  'SENGA est actuellement en maintenance afin d’améliorer nos services et vous offrir une expérience encore meilleure. Merci pour votre patience et votre confiance — nous serons de retour très bientôt !';

/** OM hidden by default until SerdiPay / Orange Money payouts are reliable. */
function defaultMmForApp(): Record<MmOperatorId, boolean> {
  return {
    ORANGE_MONEY: false,
    MPESA: true,
    AIRTEL_MONEY: true,
  };
}

export const DEFAULT_CLIENT_APPS_CONFIG: ClientAppsConfig = {
  mobileMoney: {
    senga: defaultMmForApp(),
    senga_driver: defaultMmForApp(),
    resto: defaultMmForApp(),
    location: defaultMmForApp(),
  },
  maintenance: {
    messageFr: DEFAULT_MAINTENANCE_MESSAGE_FR,
    apps: {
      senga: false,
      senga_driver: false,
      resto: false,
      location: false,
    },
  },
};

export const CLIENT_APP_LABELS_FR: Record<ClientAppId, string> = {
  senga: 'Senga (passager)',
  senga_driver: 'Senga Driver',
  resto: 'Resto',
  location: 'Location véhicule',
};

export const MM_OPERATOR_LABELS_FR: Record<MmOperatorId, string> = {
  ORANGE_MONEY: 'Orange Money',
  MPESA: 'M-Pesa',
  AIRTEL_MONEY: 'Airtel Money',
};

function isClientAppId(value: string): value is ClientAppId {
  return (CLIENT_APP_IDS as readonly string[]).includes(value);
}

function isMmOperatorId(value: string): value is MmOperatorId {
  return (MM_OPERATOR_IDS as readonly string[]).includes(value);
}

export function mergeClientAppsConfig(raw: unknown): ClientAppsConfig {
  const base = structuredClone(DEFAULT_CLIENT_APPS_CONFIG);
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Partial<ClientAppsConfig>;

  if (src.mobileMoney && typeof src.mobileMoney === 'object') {
    for (const app of CLIENT_APP_IDS) {
      const row = src.mobileMoney[app];
      if (!row || typeof row !== 'object') continue;
      for (const op of MM_OPERATOR_IDS) {
        if (typeof row[op] === 'boolean') base.mobileMoney[app][op] = row[op];
      }
    }
  }

  if (src.maintenance && typeof src.maintenance === 'object') {
    const msg = src.maintenance.messageFr;
    if (typeof msg === 'string' && msg.trim()) {
      base.maintenance.messageFr = msg.trim();
    }
    if (src.maintenance.apps && typeof src.maintenance.apps === 'object') {
      for (const app of CLIENT_APP_IDS) {
        if (typeof src.maintenance.apps[app] === 'boolean') {
          base.maintenance.apps[app] = src.maintenance.apps[app];
        }
      }
    }
  }

  return base;
}

/** Normalize header / query values to a known client app id. */
export function normalizeClientAppId(raw?: string | null): ClientAppId | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase().replace(/-/g, '_');
  if (v === 'passenger' || v === 'senga_passenger') return 'senga';
  if (v === 'driver' || v === 'senga-driver') return 'senga_driver';
  if (v === 'restaurant' || v === 'restaurants') return 'resto';
  if (v === 'rental' || v === 'rental_partner' || v === 'location_vehicule') return 'location';
  return isClientAppId(v) ? v : null;
}

/**
 * Resolve which client app a request belongs to.
 * Prefer `X-Senga-Client`, then path prefixes, then JWT role.
 */
export function resolveClientAppFromRequest(input: {
  header?: string | null;
  path?: string;
  jwtRole?: string | null;
}): ClientAppId | null {
  const fromHeader = normalizeClientAppId(input.header);
  if (fromHeader) return fromHeader;

  const path = (input.path ?? '').split('?')[0] ?? '';
  if (path.startsWith('/api/drivers')) return 'senga_driver';
  if (path.startsWith('/api/restaurant')) return 'resto';
  if (path.startsWith('/api/rental-partner')) return 'location';

  const role = (input.jwtRole ?? '').toUpperCase();
  if (role === 'DRIVER' || role === 'PENDING_KYC') return 'senga_driver';
  if (role === 'RESTAURANT') return 'resto';
  if (role === 'RENTAL_PARTNER') return 'location';
  if (role === 'PASSENGER') return 'senga';

  // Remaining passenger mobile / web API surface.
  if (
    path.startsWith('/api/rides') ||
    path.startsWith('/api/deliveries') ||
    path.startsWith('/api/wallet') ||
    path.startsWith('/api/users') ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/errands') ||
    path.startsWith('/api/moving') ||
    path.startsWith('/api/carpool') ||
    path.startsWith('/api/rental') ||
    path.startsWith('/api/history') ||
    path.startsWith('/api/express') ||
    path.startsWith('/api/geo') ||
    path.startsWith('/api/poi-suggestions') ||
    path.startsWith('/api/promo') ||
    path.startsWith('/api/billing') ||
    path.startsWith('/api/ratings') ||
    path.startsWith('/api/uploads') ||
    path.startsWith('/api/subscriptions') ||
    path.startsWith('/api/payments') ||
    path.startsWith('/api/notifications') ||
    path.startsWith('/api/tracking') ||
    path.startsWith('/api/services')
  ) {
    return 'senga';
  }

  return null;
}

export function isMmOperatorEnabled(
  config: ClientAppsConfig,
  app: ClientAppId,
  operator: string,
): boolean {
  if (!isMmOperatorId(operator)) return false;
  return config.mobileMoney[app][operator] === true;
}

export function enabledMmOperators(config: ClientAppsConfig, app: ClientAppId): MmOperatorId[] {
  return MM_OPERATOR_IDS.filter((op) => config.mobileMoney[app][op]);
}

export function isAppInMaintenance(config: ClientAppsConfig, app: ClientAppId): boolean {
  return config.maintenance.apps[app] === true;
}
