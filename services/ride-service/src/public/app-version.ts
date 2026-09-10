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

/**
 * Name floor stays `1.0.5`: Play 1.0.6 AABs still compile `AppVersion.name = '1.0.5'`.
 * Advertising `1.0.6` would show the banner on phones already on latest Play.
 * versionCode floor tracks the latest Play production AAB (`1.0.6+64`).
 * Raise this when a newer AAB is uploaded — otherwise older phones never see
 * the in-app update banner.
 */
const CURRENT_VERSION_FLOOR = '1.0.5';
const CURRENT_VERSION_CODE_FLOOR = 64;

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
      currentVersionCode: advertisedVersionCode(
        env.MOBILE_DRIVER_VERSION_CODE,
        CURRENT_VERSION_CODE_FLOOR,
      ),
      minVersionCode,
    },
  };
}
