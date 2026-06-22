#!/usr/bin/env node
/**
 * Point all MOVA Render services at a GitHub repo (default: clskas/mova).
 * Usage: RENDER_REPO=https://github.com/owner/repo node scripts/render-link-repo.mjs
 */
const API = 'https://api.render.com/v1';
const key = process.env.RENDER_API_KEY;
const REPO = process.env.RENDER_REPO || 'https://github.com/clskas/mova';
const BRANCH = process.env.RENDER_BRANCH || 'main';

const SERVICE_IDS = [
  'srv-d8slprv7f7vs73d2qn50',
  'srv-d8slrk8js32c73dac310',
  'srv-d8slrlernols73b4bcq0',
  'srv-d8slrm8g4nts73bq9pj0',
  'srv-d8slrnf7f7vs73d2t290',
  'srv-d8slrosm0tmc739cnnvg',
  'srv-d8slrpu7r5hc73fm3h50',
  'srv-d8slrr6rnols73b4bgbg',
];

if (!key) {
  console.error('RENDER_API_KEY required');
  process.exit(1);
}

async function patchRepo(id) {
  const res = await fetch(`${API}/services/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repo: REPO, branch: BRANCH, autoDeploy: 'no' }),
  });
  const body = await res.text();
  return { id, ok: res.ok, status: res.status, body };
}

async function main() {
  console.log(`Linking Render services → ${REPO}@${BRANCH}\n`);
  let failed = 0;
  for (const id of SERVICE_IDS) {
    const r = await patchRepo(id);
    if (r.ok) console.log(`✓ ${id}`);
    else {
      failed += 1;
      console.error(`✗ ${id} (${r.status}): ${r.body}`);
    }
  }
  if (failed) {
    console.error(`
Render cannot fetch ${REPO}.
Grant the Render GitHub App access to this repository, then re-run.`);
    process.exit(1);
  }
  console.log('\nAll services linked. Deploy via CI (push main) or deploy.yml.');
}

main();
