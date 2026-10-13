export type MobileAppVersionBlock = {
  currentVersion: string;
  minVersion: string;
  /** Android Play Store (défaut historique). */
  storeUrl: string;
  /** App Store iOS — utilisé par les apps iPhone/iPad. */
  storeUrlIos: string;
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
const DEFAULT_PASSENGER_STORE_IOS = 'https://apps.apple.com/app/id6818768971';
const DEFAULT_DRIVER_STORE_IOS = 'https://apps.apple.com/app/id6818769267';

/**
 * Marketing name floor must match latest Play / App Store marketing version.
 * Phones still on older binaries see behindName and get the in-app banner
 * until they install the matching store build.
 * versionCode floor tracks production (currently 142 = 1.0.30).
 * Raise both floors ONLY after the matching AAB/IPA is live on Play / App Store.
 * Raising early (e.g. to 1.0.31 before promote) keeps the banner forever for
 * users who already installed the previous store build. Stale Render env below
 * this floor also hid banners.
 */
const CURRENT_VERSION_FLOOR = '1.0.30';
const CURRENT_VERSION_CODE_FLOOR = 142;

function parseVersionCode(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw?.trim() || '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function compareSemver(a: string, b: string): number {
  const parts = (raw: string) =>
    raw
      .split('+')[0]
      .split('.')
      .map((p) => Number.parseInt(p, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l - r;
  }
  return 0;
}

/** Never advertise an older store version than the shipped floor (that hid in-app banners). */
function advertisedVersion(raw: string | undefined, floor: string): string {
  const v = raw?.trim();
  if (!v) return floor;
  return compareSemver(v, floor) >= 0 ? v : floor;
}

/** Play store versionCode must never be advertised below the shipped floor. */
function advertisedVersionCode(raw: string | undefined, floor: number): number {
  const n = parseVersionCode(raw, floor);
  return n >= floor ? n : floor;
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
      currentVersion: advertisedVersion(env.MOBILE_PASSENGER_VERSION, CURRENT_VERSION_FLOOR),
      minVersion,
      storeUrl: env.PLAY_STORE_PASSENGER_URL?.trim() || DEFAULT_PASSENGER_STORE,
      storeUrlIos: env.APP_STORE_PASSENGER_URL?.trim() || DEFAULT_PASSENGER_STORE_IOS,
      currentVersionCode: advertisedVersionCode(
        env.MOBILE_PASSENGER_VERSION_CODE,
        CURRENT_VERSION_CODE_FLOOR,
      ),
      minVersionCode,
    },
    driver: {
      currentVersion: advertisedVersion(env.MOBILE_DRIVER_VERSION, CURRENT_VERSION_FLOOR),
      minVersion,
      storeUrl: env.PLAY_STORE_DRIVER_URL?.trim() || DEFAULT_DRIVER_STORE,
      storeUrlIos: env.APP_STORE_DRIVER_URL?.trim() || DEFAULT_DRIVER_STORE_IOS,
      currentVersionCode: advertisedVersionCode(
        env.MOBILE_DRIVER_VERSION_CODE,
        CURRENT_VERSION_CODE_FLOOR,
      ),
      minVersionCode,
    },
  };
}
