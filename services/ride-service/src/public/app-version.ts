import { readFileSync } from 'fs';
import { join } from 'path';

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

export type MobileStoreVersionFile = {
  version: string;
  versionCode: number;
  updatedAt?: string;
};

const DEFAULT_PASSENGER_STORE =
  'https://play.google.com/store/apps/details?id=cd.mova.mova.passenger';
const DEFAULT_DRIVER_STORE =
  'https://play.google.com/store/apps/details?id=cd.mova.mova.driver';
const DEFAULT_PASSENGER_STORE_IOS = 'https://apps.apple.com/app/id6818768971';
const DEFAULT_DRIVER_STORE_IOS = 'https://apps.apple.com/app/id6818769267';

/**
 * Fallback only if mobile-store-version.json is missing from the image.
 * The JSON file (updated by mobile-release) is the real source of truth —
 * Render MOBILE_* env can raise above it, never lower it, so deploys and
 * stale blueprint values cannot hide in-app update banners again.
 */
/** Last-resort floor if the JSON file is missing from the image. Keep ≤ store file. */
const BUILTIN_FLOOR: MobileStoreVersionFile = {
  version: '1.0.34',
  versionCode: 174,
};

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

function advertisedVersion(raw: string | undefined, floor: string): string {
  const v = raw?.trim();
  if (!v) return floor;
  return compareSemver(v, floor) >= 0 ? v : floor;
}

function advertisedVersionCode(raw: string | undefined, floor: number): number {
  const n = parseVersionCode(raw, floor);
  return n >= floor ? n : floor;
}

/** Load the committed store version shipped inside the ride-service image. */
export function loadMobileStoreVersion(
  readFile: (path: string) => string = (p) => readFileSync(p, 'utf8'),
  dirname: string = __dirname,
): MobileStoreVersionFile {
  const candidates = [
    join(dirname, 'mobile-store-version.json'),
    join(dirname, '..', 'public', 'mobile-store-version.json'),
    join(process.cwd(), 'src', 'public', 'mobile-store-version.json'),
    join(process.cwd(), 'dist', 'public', 'mobile-store-version.json'),
  ];
  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFile(path)) as Partial<MobileStoreVersionFile>;
      const version = parsed.version?.trim();
      const versionCode = Number(parsed.versionCode);
      if (version && Number.isFinite(versionCode) && versionCode >= 0) {
        return { version, versionCode };
      }
    } catch {
      /* try next */
    }
  }
  return { ...BUILTIN_FLOOR };
}

/**
 * Versions store exposées aux apps (sans auth).
 * Plancher = fichier mobile-store-version.json (CI après Play).
 * Env MOBILE_* ne peut que monter au-dessus — jamais casser les bannières.
 */
export function buildMobileAppVersionResponse(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
  store: MobileStoreVersionFile = loadMobileStoreVersion(),
): MobileAppVersionResponse {
  const floorVersion = advertisedVersion(store.version, BUILTIN_FLOOR.version);
  const floorCode = advertisedVersionCode(
    String(store.versionCode),
    BUILTIN_FLOOR.versionCode,
  );
  const minVersion = env.MOBILE_MIN_VERSION?.trim() || '1.0.0';
  const minVersionCode = parseVersionCode(env.MOBILE_MIN_VERSION_CODE, 0);
  return {
    generatedAt: now.toISOString(),
    passenger: {
      currentVersion: advertisedVersion(env.MOBILE_PASSENGER_VERSION, floorVersion),
      minVersion,
      storeUrl: env.PLAY_STORE_PASSENGER_URL?.trim() || DEFAULT_PASSENGER_STORE,
      storeUrlIos: env.APP_STORE_PASSENGER_URL?.trim() || DEFAULT_PASSENGER_STORE_IOS,
      currentVersionCode: advertisedVersionCode(
        env.MOBILE_PASSENGER_VERSION_CODE,
        floorCode,
      ),
      minVersionCode,
    },
    driver: {
      currentVersion: advertisedVersion(env.MOBILE_DRIVER_VERSION, floorVersion),
      minVersion,
      storeUrl: env.PLAY_STORE_DRIVER_URL?.trim() || DEFAULT_DRIVER_STORE,
      storeUrlIos: env.APP_STORE_DRIVER_URL?.trim() || DEFAULT_DRIVER_STORE_IOS,
      currentVersionCode: advertisedVersionCode(
        env.MOBILE_DRIVER_VERSION_CODE,
        floorCode,
      ),
      minVersionCode,
    },
  };
}
