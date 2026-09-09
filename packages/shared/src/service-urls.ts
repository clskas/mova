export const SERVICE_PORTS = {
  gateway: 3000,
  auth: 3001,
  ride: 3002,
  payment: 3003,
  driver: 3004,
  notification: 3005,
  admin: 3006,
} as const;

const ENV_KEYS: Record<keyof typeof SERVICE_PORTS, string> = {
  gateway: 'GATEWAY_SERVICE_URL',
  auth: 'AUTH_SERVICE_URL',
  ride: 'RIDE_SERVICE_URL',
  payment: 'PAYMENT_SERVICE_URL',
  driver: 'DRIVER_SERVICE_URL',
  notification: 'NOTIFICATION_SERVICE_URL',
  admin: 'ADMIN_SERVICE_URL',
};

const DOCKER_HOSTS: Record<keyof typeof SERVICE_PORTS, string> = {
  gateway: 'http://api-gateway:3000',
  auth: 'http://auth-service:3000',
  ride: 'http://ride-service:3000',
  payment: 'http://payment-service:3000',
  driver: 'http://driver-service:3000',
  notification: 'http://notification-service:3000',
  admin: 'http://admin-service:3000',
};

const LOCAL_HOSTS: Record<keyof typeof SERVICE_PORTS, string> = {
  gateway: `http://localhost:${SERVICE_PORTS.gateway}`,
  auth: `http://localhost:${SERVICE_PORTS.auth}`,
  ride: `http://localhost:${SERVICE_PORTS.ride}`,
  payment: `http://localhost:${SERVICE_PORTS.payment}`,
  driver: `http://localhost:${SERVICE_PORTS.driver}`,
  notification: `http://localhost:${SERVICE_PORTS.notification}`,
  admin: `http://localhost:${SERVICE_PORTS.admin}`,
};

/** Public Render hosts — used when AUTH_SERVICE_URL etc. were dropped by the 20-var UI limit. */
const RENDER_PUBLIC_HOSTS: Record<keyof typeof SERVICE_PORTS, string> = {
  gateway: 'https://mova-gateway.onrender.com',
  auth: 'https://mova-auth.onrender.com',
  ride: 'https://mova-ride.onrender.com',
  payment: 'https://mova-payment.onrender.com',
  driver: 'https://mova-driver.onrender.com',
  notification: 'https://mova-notification.onrender.com',
  admin: 'https://mova-admin.onrender.com',
};

function isRenderRuntime(): boolean {
  if ((process.env.RENDER ?? '').trim()) return true;
  if ((process.env.RENDER_SERVICE_ID ?? '').trim()) return true;
  if ((process.env.RENDER_EXTERNAL_URL ?? '').trim()) return true;
  return false;
}

/**
 * Render `fromService.property: hostport` injects `hostname:port` without a scheme.
 * Undici `fetch()` requires an absolute URL — missing `http://` → « fetch failed ».
 * http-proxy-middleware often still works, which hid the bug for the gateway.
 */
export function normalizeServiceBaseUrl(raw?: string | null): string {
  const trimmed = (raw ?? '').trim().replace(/\/$/, '');
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function isLoopbackServiceUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(url);
}

function defaultHost(service: keyof typeof SERVICE_PORTS): string {
  const fromEnv = normalizeServiceBaseUrl(process.env[ENV_KEYS[service]]);
  if (fromEnv) {
    // Stale localhost AUTH_SERVICE_URL on Render must not poison inter-service fetch.
    if (isRenderRuntime() && isLoopbackServiceUrl(fromEnv)) {
      return RENDER_PUBLIC_HOSTS[service];
    }
    return fromEnv;
  }
  if (isRenderRuntime()) return RENDER_PUBLIC_HOSTS[service];
  if (process.env.DOCKER === 'true' || process.env.KUBERNETES_SERVICE_HOST) {
    return DOCKER_HOSTS[service];
  }
  return LOCAL_HOSTS[service];
}

export function serviceUrl(service: keyof typeof SERVICE_PORTS, path = ''): string {
  const host = defaultHost(service);
  const base = host.replace(/\/$/, '');
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Browser `NEXT_PUBLIC_API_URL` must be the gateway origin (no `/api` suffix).
 * Clients append `/api/...` paths; a trailing `/api` caused `/api/api/...` 404s in prod.
 */
export function normalizePublicApiBaseUrl(raw?: string | null, fallback = 'http://localhost:3000'): string {
  const base = (raw ?? fallback).trim().replace(/\/+$/, '');
  return base.replace(/\/api$/i, '') || fallback;
}

/**
 * Inter-service key (dev default). Prefer resolveInternalApiKey() at call sites.
 * Production bootstrap rejects the weak default via assertProductionSecurity().
 */
export const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? 'mova-internal-dev';
