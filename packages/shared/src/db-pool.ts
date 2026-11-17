/**
 * Database connection budget.
 *
 * In production the five Prisma services (auth, ride, payment, driver, notification) share
 * ONE Postgres, which accepts about 100 connections. Without connection_limit Prisma opens
 * up to 2 × CPUs + 1 connections per service, counted on the Render host — far more than
 * needed — and during a deploy the old and new copies of every service are up together.
 * That filled the database on 2026-11-16 (Sentry SENGA-BACKEND-3H: "remaining connection
 * slots are reserved for roles with the SUPERUSER attribute").
 *
 * Default budget: ride 16 + payment 6 + auth 6 + driver 5 + notification 4 = 37, so 74
 * during a deploy, below the limit. DB_CONNECTION_LIMIT / DB_POOL_TIMEOUT_SEC override it
 * per service, and a connection_limit already in DATABASE_URL always wins.
 */
export const DB_POOL_DEFAULTS = {
  ride: 16,
  payment: 6,
  auth: 6,
  driver: 5,
  notification: 4,
} as const;

/** Adds connection_limit / pool_timeout to the database URL unless it already sets them. */
export function withPoolSettings(url: string | undefined, limit: number, timeoutSec: number): string | undefined {
  if (!url?.trim()) return url;
  const add: string[] = [];
  if (!/[?&]connection_limit=/.test(url)) add.push(`connection_limit=${limit}`);
  if (!/[?&]pool_timeout=/.test(url)) add.push(`pool_timeout=${timeoutSec}`);
  if (!add.length) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${add.join('&')}`;
}

function envInt(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(env[name] ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * Prisma constructor options with the pool size of this service.
 * Usage: `super(prismaPoolOptions(DB_POOL_DEFAULTS.auth))`.
 */
export function prismaPoolOptions(
  defaultLimit: number,
  env: NodeJS.ProcessEnv = process.env,
): { datasourceUrl: string } | undefined {
  const url = withPoolSettings(
    env.DATABASE_URL,
    envInt(env, 'DB_CONNECTION_LIMIT', defaultLimit, 1, 60),
    envInt(env, 'DB_POOL_TIMEOUT_SEC', 20, 5, 60),
  );
  return url ? { datasourceUrl: url } : undefined;
}
