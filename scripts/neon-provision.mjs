#!/usr/bin/env node
/**
 * Create Neon project + MOVA microservice databases (idempotent).
 * Requires NEON_API_KEY. Writes config/neon-project.json (no passwords).
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API = 'https://console.neon.tech/api/v2';
const key = process.env.NEON_API_KEY;
const PROJECT_NAME = process.env.NEON_PROJECT_NAME || 'mova-rdc';
const REGION = process.env.NEON_REGION || 'aws-eu-central-1';

const DBS = [
  'mova_auth',
  'mova_rides',
  'mova_payments',
  'mova_drivers',
  'mova_notifications',
];

if (!key) {
  console.error('NEON_API_KEY is required');
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
    throw new Error(`${method} ${path} → ${res.status}: ${data?.message || text}`);
  }
  return data;
}

async function waitBranchReady(projectId, branchId) {
  for (let i = 0; i < 24; i++) {
    const { branch } = await api('GET', `/projects/${projectId}/branches/${branchId}`);
    if (branch?.current_state === 'ready') return;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Neon branch not ready in time');
}

async function findOrCreateProject() {
  const configPath = join(ROOT, 'config', 'neon-project.json');
  if (existsSync(configPath)) {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    if (cfg.projectId) {
      console.log(`Using existing project ${cfg.projectId} from config`);
      return cfg;
    }
  }

  const { projects } = await api('GET', '/projects');
  const existing = projects?.find((p) => p.name === PROJECT_NAME);
  if (existing) {
    return { projectId: existing.id, branchId: null, name: existing.name };
  }

  console.log(`Creating Neon project ${PROJECT_NAME}…`);
  const created = await api('POST', '/projects', {
    project: { name: PROJECT_NAME, region_id: REGION, pg_version: 16 },
  });
  return {
    projectId: created.project.id,
    branchId: created.branch.id,
    name: created.project.name,
  };
}

async function resolveBranch(projectId, branchId) {
  if (branchId) return branchId;
  const { branches } = await api('GET', `/projects/${projectId}/branches`);
  const main = branches?.find((b) => b.primary) || branches?.[0];
  if (!main) throw new Error('No branch found');
  return main.id;
}

async function ensureDatabase(projectId, branchId, name) {
  const { databases } = await api(
    'GET',
    `/projects/${projectId}/branches/${branchId}/databases`,
  );
  if (databases?.some((d) => d.name === name)) {
    console.log(`✓ database ${name}`);
    return;
  }
  await api('POST', `/projects/${projectId}/branches/${branchId}/databases`, {
    database: { name, owner_name: 'neondb_owner' },
  });
  console.log(`+ database ${name}`);
}

async function connectionUri(projectId, branchId, databaseName) {
  const { uri } = await api(
    'GET',
    `/projects/${projectId}/connection_uri?database_name=${databaseName}&role_name=neondb_owner&branch_id=${branchId}&pooled=true`,
  );
  return uri;
}

async function main() {
  let cfg = await findOrCreateProject();
  const branchId = await resolveBranch(cfg.projectId, cfg.branchId);
  await waitBranchReady(cfg.projectId, branchId);

  for (const db of DBS) {
    await ensureDatabase(cfg.projectId, branchId, db);
  }

  cfg = {
    name: cfg.name || PROJECT_NAME,
    projectId: cfg.projectId,
    branchId,
    region: REGION,
    databases: DBS,
    updatedAt: new Date().toISOString(),
  };

  const configPath = join(ROOT, 'config', 'neon-project.json');
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`Wrote ${configPath}`);

  console.log('\n--- GitHub secrets (DATABASE_URL_*) ---');
  const map = {
    DATABASE_URL_AUTH: 'mova_auth',
    DATABASE_URL_RIDES: 'mova_rides',
    DATABASE_URL_PAYMENTS: 'mova_payments',
    DATABASE_URL_DRIVERS: 'mova_drivers',
    DATABASE_URL_NOTIFICATIONS: 'mova_notifications',
  };
  for (const [secret, db] of Object.entries(map)) {
    const uri = await connectionUri(cfg.projectId, branchId, db);
    console.log(`${secret}=${uri}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
