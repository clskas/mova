#!/usr/bin/env node
/**
 * Provision MOVA infrastructure on Render (idempotent).
 * Requires RENDER_API_KEY and optionally RENDER_OWNER_ID (workspace).
 *
 * Creates Docker web services with autoDeploy on push to main.
 * Databases/Redis: set via env (Neon / external) — see config/render-services.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API = 'https://api.render.com/v1';
const OWNER_ID = process.env.RENDER_OWNER_ID || 'tea-d8gnpfm7r5hc73bceacg';
const REPO = process.env.RENDER_REPO || 'https://github.com/afri-soft-com/mova';
const BRANCH = process.env.RENDER_BRANCH || 'main';
const REGION = process.env.RENDER_REGION || 'frankfurt';
/** Internal Render Key Value URL (same region as MOVA services). Prefer over external rediss:// URLs. */
const REDIS_INTERNAL_URL =
  process.env.REDIS_INTERNAL_URL || 'redis://red-d8ldvi6q1p3s738q1cn0:6379';
const PLAN = process.env.RENDER_PLAN || 'free';

const key = process.env.RENDER_API_KEY;
if (!key) {
  console.error('RENDER_API_KEY is required');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${key}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === 'object' ? data?.message || JSON.stringify(data) : data;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

async function listServices() {
  const out = [];
  let cursor = '';
  for (;;) {
    const q = new URLSearchParams({ limit: '100', ownerId: OWNER_ID });
    if (cursor) q.set('cursor', cursor);
    const page = await api('GET', `/services?${q}`);
    for (const row of page || []) {
      out.push(row.service || row);
    }
    cursor = page?.cursor || '';
    if (!cursor || (page?.length ?? 0) < 100) break;
  }
  return out;
}

function dockerService(name, dockerfilePath, extra = {}) {
  return {
    name,
    type: 'web_service',
    ownerId: OWNER_ID,
    repo: REPO,
    branch: BRANCH,
    // CI deploy.yml triggers deploy after tests — avoids deploying broken main commits
    autoDeploy: process.env.RENDER_AUTO_DEPLOY === 'yes' ? 'yes' : 'no',
    serviceDetails: {
      runtime: 'docker',
      plan: PLAN,
      region: REGION,
      healthCheckPath: extra.healthCheckPath ?? '/health',
      envSpecificDetails: {
        dockerfilePath,
        dockerContext: '.',
      },
    },
    envVars: extra.envVars ?? [],
  };
}

const WEB_SERVICES = [
  dockerService('mova-gateway', './docker/gateway.Dockerfile', {
    envVars: [{ key: 'JWT_SECRET', generateValue: true }],
  }),
  dockerService('mova-auth', './docker/auth.Dockerfile', {
    envVars: [
      { key: 'MOCK_OTP', value: 'false' },
      { key: 'DATABASE_URL', value: process.env.DATABASE_URL_AUTH || '' },
      { key: 'REDIS_URL', value: process.env.REDIS_URL || '' },
    ].filter((e) => e.value || e.generateValue),
  }),
  dockerService('mova-ride', './docker/ride.Dockerfile'),
  dockerService('mova-payment', './docker/payment.Dockerfile', {
    envVars: [{ key: 'MOCK_PAYMENTS', value: 'false' }],
  }),
  dockerService('mova-driver', './docker/driver.Dockerfile'),
  dockerService('mova-notification', './docker/notification.Dockerfile'),
  dockerService('mova-admin', './docker/admin.Dockerfile', {
    envVars: [{ key: 'INTERNAL_API_KEY', generateValue: true }],
  }),
  dockerService('mova-web', './docker/web.Dockerfile', {
    healthCheckPath: '/',
  }),
];

async function ensureService(existing, spec) {
  const found = existing.find((s) => s.name === spec.name);
  if (found) {
    console.log(`✓ ${spec.name} already exists (${found.id})`);
    return found;
  }
  console.log(`+ Creating ${spec.name}…`);
  const created = await api('POST', '/services', spec);
  const svc = created.service || created;
  console.log(`  → ${svc.id} ${svc.serviceDetails?.url || ''}`);
  return svc;
}

/** Upsert one env var — never replaces the full list (PUT /env-vars wipes omitted keys). */
async function upsertEnvVar(serviceId, key, value) {
  if (value === undefined || value === null || value === '') return;
  await api('PUT', `/services/${serviceId}/env-vars/${encodeURIComponent(key)}`, {
    value: String(value),
  });
}

async function ensureSharedJwtSecret(gatewayId) {
  const jwt = await api('GET', `/services/${gatewayId}/env-vars`);
  const rows = jwt || [];
  const existing = rows.find((e) => (e.envVar?.key || e.key) === 'JWT_SECRET');
  const value = existing?.envVar?.value ?? existing?.value;
  if (value && String(value).trim().length >= 32) return String(value).trim();

  // Generate on gateway (Render stores it); re-read if API returns the value.
  await api('PUT', `/services/${gatewayId}/env-vars/JWT_SECRET`, { generateValue: true });
  const again = await api('GET', `/services/${gatewayId}/env-vars`);
  const row = (again || []).find((e) => (e.envVar?.key || e.key) === 'JWT_SECRET');
  const generated = row?.envVar?.value ?? row?.value;
  if (generated && String(generated).trim().length >= 32) return String(generated).trim();

  // Fallback if Render redacts generateValue secrets on GET
  const { randomBytes } = await import('node:crypto');
  const local = randomBytes(48).toString('base64url');
  await upsertEnvVar(gatewayId, 'JWT_SECRET', local);
  return local;
}

async function wireEnvVars(services) {
  const byName = Object.fromEntries(services.map((s) => [s.name, s]));
  const url = (name) => byName[name]?.serviceDetails?.url?.replace(/^https:\/\//, '') || '';

  const gateway = byName['mova-gateway'];
  if (!gateway?.id) return;

  const jwtSecret = await ensureSharedJwtSecret(gateway.id);

  const updates = {
    'mova-gateway': {
      AUTH_SERVICE_URL: `https://${url('mova-auth')}`,
      RIDE_SERVICE_URL: `https://${url('mova-ride')}`,
      PAYMENT_SERVICE_URL: `https://${url('mova-payment')}`,
      DRIVER_SERVICE_URL: `https://${url('mova-driver')}`,
      NOTIFICATION_SERVICE_URL: `https://${url('mova-notification')}`,
      ADMIN_SERVICE_URL: `https://${url('mova-admin')}`,
      HEALTH_CHECK_TIMEOUT_MS: '45000',
      HEALTH_CHECK_RETRIES: '2',
      JWT_SECRET: jwtSecret,
    },
    'mova-auth': {
      DATABASE_URL: process.env.DATABASE_URL_AUTH,
      REDIS_URL: process.env.REDIS_URL || REDIS_INTERNAL_URL,
      JWT_SECRET: jwtSecret,
    },
    'mova-ride': {
      DATABASE_URL: process.env.DATABASE_URL_RIDES,
      REDIS_URL: process.env.REDIS_URL || REDIS_INTERNAL_URL,
      JWT_SECRET: jwtSecret,
      DRIVER_SERVICE_URL: `https://${url('mova-driver')}`,
    },
    'mova-payment': {
      DATABASE_URL: process.env.DATABASE_URL_PAYMENTS,
      REDIS_URL: process.env.REDIS_URL || REDIS_INTERNAL_URL,
      JWT_SECRET: jwtSecret,
      RIDE_SERVICE_URL: `https://${url('mova-ride')}`,
    },
    'mova-driver': {
      DATABASE_URL: process.env.DATABASE_URL_DRIVERS,
      REDIS_URL: process.env.REDIS_URL || REDIS_INTERNAL_URL,
      JWT_SECRET: jwtSecret,
      RIDE_SERVICE_URL: `https://${url('mova-ride')}`,
    },
    'mova-notification': {
      DATABASE_URL: process.env.DATABASE_URL_NOTIFICATIONS,
      REDIS_URL: process.env.REDIS_URL || REDIS_INTERNAL_URL,
      JWT_SECRET: jwtSecret,
    },
    'mova-admin': {
      JWT_SECRET: jwtSecret,
      AUTH_SERVICE_URL: `https://${url('mova-auth')}`,
      RIDE_SERVICE_URL: `https://${url('mova-ride')}`,
      DRIVER_SERVICE_URL: `https://${url('mova-driver')}`,
    },
    'mova-web': {
      NEXT_PUBLIC_API_URL: `https://${url('mova-gateway')}/api`,
    },
  };

  for (const [name, vars] of Object.entries(updates)) {
    const svc = byName[name];
    if (!svc?.id) continue;
    const pairs = Object.entries(vars).filter(([, v]) => v);
    if (!pairs.length) continue;
    console.log(`  env ${name}: ${pairs.map(([k]) => k).join(', ')}`);
    for (const [k, v] of pairs) {
      await upsertEnvVar(svc.id, k, v);
    }
  }
}

async function main() {
  console.log(`Render provision — workspace ${OWNER_ID}, repo ${REPO}@${BRANCH}`);
  const existing = await listServices();
  const mova = [];
  for (const spec of WEB_SERVICES) {
    const svc = await ensureService(existing, spec);
    mova.push(svc);
    existing.push(svc);
  }

  await wireEnvVars(mova);

  const fresh = await listServices();
  const movaServices = fresh.filter((s) => s.name?.startsWith('mova-'));
  const ids = movaServices.map((s) => s.id);
  const gateway = movaServices.find((s) => s.name === 'mova-gateway');

  const config = {
    ownerId: OWNER_ID,
    region: REGION,
    repo: REPO,
    branch: BRANCH,
    autoDeploy: true,
    gatewayUrl: gateway?.serviceDetails?.url || null,
    gatewayServiceId: gateway?.id || null,
    serviceIds: ids,
    services: Object.fromEntries(
      movaServices.map((s) => [
        s.name,
        { id: s.id, url: s.serviceDetails?.url || null },
      ]),
    ),
    updatedAt: new Date().toISOString(),
  };

  const configPath = join(ROOT, 'config', 'render-services.json');
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  console.log('\n--- GitHub secrets (Actions) ---');
  console.log(`RENDER_SERVICE_IDS=${ids.join(' ')}`);
  console.log(`GATEWAY_RENDER_SERVICE_ID=${gateway?.id || ''}`);
  console.log(`SMOKE_API_URL=${gateway?.serviceDetails?.url || ''}/api`);
  console.log(`PROD_API_URL=${gateway?.serviceDetails?.url || ''}/api`);
  console.log(`PROD_WS_URL=${gateway?.serviceDetails?.url || ''}`);
  console.log(`\nWrote ${configPath}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
