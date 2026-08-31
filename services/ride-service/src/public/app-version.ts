export type MobileAppVersionBlock = {
  currentVersion: string;
  minVersion: string;
  storeUrl: string;
  currentVersionCode: number;
  minVersionCode: number;
};

export type MobileAppVersionResponse = {
  generatedAt: string;
  passenger: MobileAppVersionBlock;
  driver: MobileAppVersionBlock;
};

const DEFAULT_PASSENGER_STORE =
  'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger';
const DEFAULT_DRIVER_STORE =
  'https://play.google.com/store/apps/details?id=cd.mova.mova.driver';

function parseVersionCode(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw?.trim() || '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Versions store exposées aux apps (sans auth). Lever MOBILE_*_VERSION après un upload Play. */
export function buildMobileAppVersionResponse(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): MobileAppVersionResponse {
  const minVersion = env.MOBILE_MIN_VERSION?.trim() || '1.0.0';
  const minVersionCode = parseVersionCode(env.MOBILE_MIN_VERSION_CODE, 0);
  return {
    generatedAt: now.toISOString(),
    passenger: {
      currentVersion: env.MOBILE_PASSENGER_VERSION?.trim() || '1.0.2',
      minVersion,
      storeUrl: env.PLAY_STORE_PASSENGER_URL?.trim() || DEFAULT_PASSENGER_STORE,
      currentVersionCode: parseVersionCode(env.MOBILE_PASSENGER_VERSION_CODE, 0),
      minVersionCode,
    },
    driver: {
      currentVersion: env.MOBILE_DRIVER_VERSION?.trim() || '1.0.2',
      minVersion,
      storeUrl: env.PLAY_STORE_DRIVER_URL?.trim() || DEFAULT_DRIVER_STORE,
      currentVersionCode: parseVersionCode(env.MOBILE_DRIVER_VERSION_CODE, 0),
      minVersionCode,
    },
  };
}
