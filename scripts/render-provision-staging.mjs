#!/usr/bin/env node
/**
 * Provision the SENGA pre-production (staging) stack on Render — idempotent.
 *
 * Isolated from production: own Postgres instance (one schema per service, no external access),
 * own Key Value, mocked SMS / OTP / e-mail / Mobile Money, separate JWT and
 * internal keys. Writes config/render-services.staging.json with the SAME role
 * keys as config/render-services.json ("mova-auth", …) so render-deploy.sh and
 * render-guard.sh work unchanged with RENDER_SERVICES_FILE.
 *
 * Env: RENDER_API_KEY (required), RENDER_OWNER_ID, RENDER_REPO, RENDER_BRANCH,
 *      STAGING_PLAN (default starter), STAGING_DB_PLAN (default basic_256mb).
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API = 'https://api.render.com/v1';
const OWNER_ID = process.env.RENDER_OWNER_ID || 'tea-d8gnpfm7r5hc73bceacg';
const REPO = process.env.RENDER_REPO || 'https://github.com/afri-soft-com/mova';
const BRANCH = process.env.RENDER_BRANCH || 'main';
const REGION = process.env.RENDER_REGION || 'frankfurt';
const PLAN = process.env.STAGING_PLAN || 'starter';
const DB_PLAN = process.env.STAGING_DB_PLAN || 'basic_256mb';
const PREFIX = 'mova-stg';

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

async function listAll(path, unwrap) {
  const out = [];
  let cursor = '';
  for (;;) {
    const q = new URLSearchParams({ limit: '100', ownerId: OWNER_ID });
    if (cursor) q.set('cursor', cursor);
    const page = (await api('GET', `${path}?${q}`)) || [];
    for (const row of page) out.push(row[unwrap] || row);
    cursor = page.at(-1)?.cursor || '';
    if (!cursor || page.length < 100) break;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensurePostgres() {
  const name = `${PREFIX}-db`;
  let db = (await listAll('/postgres', 'postgres')).find((p) => p.name === name);
  if (!db) {
    console.log(`+ Creating Postgres ${name} (${DB_PLAN})…`);
    db = await api('POST', '/postgres', {
      name,
      ownerId: OWNER_ID,
      plan: DB_PLAN,
      region: REGION,
      version: '16',
      databaseName: 'mova_auth',
      databaseUser: 'mova',
    });
  } else {
    console.log(`✓ Postgres ${name} exists (${db.id})`);
  }
  for (let i = 0; i < 60; i += 1) {
    const cur = await api('GET', `/postgres/${db.id}`);
    if (cur.status === 'available') break;
    console.log(`  Postgres status=${cur.status} — waiting`);
    await sleep(15_000);
  }
  const info = await api('GET', `/postgres/${db.id}/connection-info`);
  return { id: db.id, internal: info.internalConnectionString };
}

/** One Postgres database, one schema per service (Prisma creates it on migrate). */
function withSchema(url, schema) {
  const u = new URL(url);
  u.searchParams.set('schema', schema);
  return u.toString();
}

async function ensureKeyValue() {
  const name = `${PREFIX}-redis`;
  let kv = (await listAll('/key-value', 'keyValue')).find((k) => k.name === name);
  if (!kv) {
    console.log(`+ Creating Key Value ${name} (free)…`);
    kv = await api('POST', '/key-value', {
      name,
      ownerId: OWNER_ID,
      plan: 'free',
      region: REGION,
    });
  } else {
    console.log(`✓ Key Value ${name} exists (${kv.id})`);
  }
  for (let i = 0; i < 40; i += 1) {
    const cur = await api('GET', `/key-value/${kv.id}`);
    if (cur.status === 'available') break;
    await sleep(10_000);
  }
  const info = await api('GET', `/key-value/${kv.id}/connection-info`);
  return info.internalConnectionString;
}

const ROLES = {
  'mova-gateway': { dockerfile: './docker/gateway.Dockerfile', health: '/health/live' },
  'mova-auth': { dockerfile: './docker/auth.Dockerfile', health: '/health' },
  'mova-ride': { dockerfile: './docker/ride.Dockerfile', health: '/health/live' },
  'mova-payment': { dockerfile: './docker/payment.Dockerfile', health: '/health' },
  'mova-driver': { dockerfile: './docker/driver.Dockerfile', health: '/health' },
  'mova-notification': { dockerfile: './docker/notification.Dockerfile', health: '/health' },
  'mova-admin': { dockerfile: './docker/admin.Dockerfile', health: '/health' },
  'mova-web': { dockerfile: './docker/web.Dockerfile', health: '/' },
  'mova-admin-web': { dockerfile: './docker/admin-web.Dockerfile', health: '/' },
};

const stagingName = (role) => role.replace(/^mova-/, `${PREFIX}-`);

async function ensureServices() {
  const existing = await listAll('/services', 'service');
  const out = {};
  for (const [role, spec] of Object.entries(ROLES)) {
    const name = stagingName(role);
    let svc = existing.find((s) => s.name === name);
    if (!svc) {
      console.log(`+ Creating ${name}…`);
      const created = await api('POST', '/services', {
        name,
        type: 'web_service',
        ownerId: OWNER_ID,
        repo: REPO,
        branch: BRANCH,
        // Deployed by CI (deploy.yml) with an explicit commit, before production.
        autoDeploy: 'no',
        serviceDetails: {
          runtime: 'docker',
          plan: PLAN,
          region: REGION,
          healthCheckPath: spec.health,
          envSpecificDetails: { dockerfilePath: spec.dockerfile, dockerContext: '.' },
        },
      });
      svc = created.service || created;
    } else {
      console.log(`✓ ${name} exists (${svc.id})`);
    }
    out[role] = { id: svc.id, name, url: svc.serviceDetails?.url || `https://${name}.onrender.com` };
  }
  return out;
}

async function readEnv(serviceId, envKey) {
  const rows = (await api('GET', `/services/${serviceId}/env-vars`)) || [];
  const row = rows.find((e) => (e.envVar?.key || e.key) === envKey);
  return row?.envVar?.value ?? row?.value ?? '';
}

async function upsertEnv(serviceId, envKey, value) {
  await api('PUT', `/services/${serviceId}/env-vars/${encodeURIComponent(envKey)}`, { value: String(value) });
}

async function wireEnv(services, pgInternal, redisUrl) {
  const gw = services['mova-gateway'].id;
  // Reuse secrets on re-runs so tokens issued by staging stay valid.
  const jwtSecret = (await readEnv(gw, 'JWT_SECRET')) || randomBytes(48).toString('base64url');
  const internalKey = (await readEnv(gw, 'INTERNAL_API_KEY')) || randomBytes(32).toString('base64url');
  const url = (role) => services[role].url;
  const db = (schema) => withSchema(pgInternal, schema);

  const common = {
    NODE_ENV: 'staging',
    APP_ENV: 'staging',
    JWT_SECRET: jwtSecret,
    INTERNAL_API_KEY: internalKey,
    REDIS_URL: redisUrl,
    MOVA_SKIP_BACKUP: '1',
    RUN_SEED: 'false',
  };
  const mocks = { MOCK_OTP: 'true', MOCK_SMS: 'true', MOCK_EMAIL: 'true', ALLOW_TEST_OTP: 'true' };
  const urls = {
    AUTH_SERVICE_URL: url('mova-auth'),
    RIDE_SERVICE_URL: url('mova-ride'),
    PAYMENT_SERVICE_URL: url('mova-payment'),
    DRIVER_SERVICE_URL: url('mova-driver'),
    NOTIFICATION_SERVICE_URL: url('mova-notification'),
    ADMIN_SERVICE_URL: url('mova-admin'),
  };
  const env = {
    'mova-gateway': {
      ...common,
      ...urls,
      HEALTH_CHECK_TIMEOUT_MS: '45000',
      HEALTH_CHECK_RETRIES: '2',
      CORS_ORIGIN: [url('mova-web'), url('mova-admin-web')].join(','),
    },
    'mova-auth': { ...common, ...mocks, ...urls, DATABASE_URL: db('auth') },
    'mova-ride': {
      ...common,
      ...urls,
      DATABASE_URL: db('rides'),
      MOCK_PAYMENTS: 'true',
      NODE_OPTIONS: '--max-old-space-size=384',
    },
    'mova-payment': {
      ...common,
      ...urls,
      DATABASE_URL: db('payments'),
      MOCK_PAYMENTS: 'true',
      MOBILE_MONEY_GATEWAY: 'mock',
    },
    'mova-driver': { ...common, ...urls, DATABASE_URL: db('drivers') },
    'mova-notification': { ...common, ...mocks, DATABASE_URL: db('notifications') },
    'mova-admin': { ...common, ...urls },
    'mova-web': { NEXT_PUBLIC_API_URL: url('mova-gateway') },
    'mova-admin-web': { NEXT_PUBLIC_API_URL: url('mova-gateway') },
  };
  for (const [role, vars] of Object.entries(env)) {
    console.log(`  env ${services[role].name}: ${Object.keys(vars).join(', ')}`);
    for (const [k, v] of Object.entries(vars)) await upsertEnv(services[role].id, k, v);
  }
}

async function main() {
  console.log(`Staging provision — workspace ${OWNER_ID}, ${REPO}@${BRANCH}, plan ${PLAN}`);
  const pg = await ensurePostgres();
  const redisUrl = await ensureKeyValue();
  const services = await ensureServices();
  await wireEnv(services, pg.internal, redisUrl);

  const file = {
    note: 'Pre-production (staging) Render services. Same role keys as render-services.json. Generated by scripts/render-provision-staging.mjs.',
    gatewayUrl: services['mova-gateway'].url,
    webUrl: services['mova-web'].url,
    adminWebUrl: services['mova-admin-web'].url,
    gatewayServiceId: services['mova-gateway'].id,
    postgresId: pg.id,
    services: Object.fromEntries(Object.entries(services).map(([role, s]) => [role, { id: s.id, name: s.name, url: s.url }])),
  };
  const out = join(ROOT, 'config', 'render-services.staging.json');
  writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`Wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
