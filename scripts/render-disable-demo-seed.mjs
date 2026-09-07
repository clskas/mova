/**
 * Set RUN_SEED=false / SKIP_DEMO_SEED=true on Render Prisma services.
 * Never prints secret values. Requires RENDER_API_KEY.
 *
 *   node scripts/render-disable-demo-seed.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED_FLAGS = {
  RUN_SEED: 'false',
  SKIP_DEMO_SEED: 'true',
  SEED_DEMO_CATALOG: 'false',
  APP_ENV: 'production',
  NODE_ENV: 'production',
};

const TARGET_SERVICES = ['mova-auth', 'mova-ride', 'mova-payment', 'mova-driver', 'mova-notification'];

async function renderJson(apiPath, init = {}) {
  const key = process.env.RENDER_API_KEY;
  if (!key) throw new Error('RENDER_API_KEY is not set');
  const res = await fetch(`https://api.render.com/v1${apiPath}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${key}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Render API ${apiPath} HTTP ${res.status}`);
  }
  return text ? JSON.parse(text) : null;
}

function envListToMap(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  const map = new Map();
  for (const row of rows) {
    const ev = row.envVar ?? row;
    if (ev?.key) map.set(ev.key, ev.value ?? '');
  }
  return map;
}

async function putEnvVar(serviceId, key, value) {
  const res = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value }),
  });
  if (res.status === 404) {
    const created = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key, value }),
    });
    if (!created.ok) throw new Error(`Create ${key} HTTP ${created.status}`);
    return 'created';
  }
  if (!res.ok) throw new Error(`Update ${key} HTTP ${res.status}`);
  return 'updated';
}

async function main() {
  if (!process.env.RENDER_API_KEY) {
    console.log('RENDER_API_KEY unset — skip Render env patch (no keys printed).');
    process.exit(0);
  }

  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const cfg = JSON.parse(readFileSync(join(root, 'config/render-services.json'), 'utf8'));

  for (const name of TARGET_SERVICES) {
    const id = cfg.services?.[name]?.id;
    if (!id) {
      console.log(`skip ${name}: no service id`);
      continue;
    }
    let current;
    try {
      current = envListToMap(await renderJson(`/services/${id}/env-vars`));
    } catch {
      console.log(`${name}: could not list env vars — still applying seed flags`);
      current = new Map();
    }
    const before = {};
    for (const flag of Object.keys(SEED_FLAGS)) {
      before[flag] = current.has(flag) ? current.get(flag) : '(unset)';
    }
    console.log(`${name} (${id}) seed flags before:`, before);
    for (const [key, value] of Object.entries(SEED_FLAGS)) {
      const action = await putEnvVar(id, key, value);
      console.log(`  ${action} ${key}=${value}`);
    }
  }
  console.log('Done. Production seed of fake phones is forbidden.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'Render env patch failed');
  process.exit(1);
});
