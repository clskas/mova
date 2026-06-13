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

function defaultHost(service: keyof typeof SERVICE_PORTS): string {
  if (process.env[ENV_KEYS[service]]) return process.env[ENV_KEYS[service]]!;
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

export const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? 'mova-internal-dev';
