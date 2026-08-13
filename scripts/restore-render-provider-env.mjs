#!/usr/bin/env node
/**
 * Restore provider secrets from config/external-apis.env onto Render (upsert by key).
 * Does not log secret values.
 */
import { readFileSync } from 'node:fs';

const API = 'https://api.render.com/v1';
const key = process.env.RENDER_API_KEY;
if (!key) {
  console.error('RENDER_API_KEY required');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${key}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

function parseEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

async function put(id, k, v) {
  if (v === undefined || v === null || v === '') return false;
  const res = await fetch(
    `${API}/services/${id}/env-vars/${encodeURIComponent(k)}`,
    { method: 'PUT', headers, body: JSON.stringify({ value: String(v) }) },
  );
  if (!res.ok) {
    throw new Error(`${id} ${k} → ${res.status}`);
  }
  return true;
}

const env = parseEnv('config/external-apis.env');
env.MOCK_PAYMENTS ||= 'false';
env.SMS_PROVIDER ||= 'africastalking';
env.MOBILE_MONEY_GATEWAY ||= 'serdipay';
env.SERDIPAY_BASE_URL ||= 'https://apis.serdipay.com';
env.AFRICAS_TALKING_ENV ||= 'production';
env.AFRICAS_TALKING_SMS_SENDER ||= 'MOVA';

const needed = [
  'SERDIPAY_CLIENT_ID',
  'SERDIPAY_CLIENT_SECRET',
  'SERDIPAY_MERCHANT_ID',
  'SERDIPAY_WEBHOOK_SECRET',
  'SERDIPAY_BASE_URL',
  'SERDIPAY_TOKEN_PATH',
  'SERDIPAY_SMS_PATH',
  'SERDIPAY_SMS_BASE_URL',
  'SERDIPAY_SMS_API_ID',
  'SERDIPAY_SMS_API_KEY',
  'SERDIPAY_SMS_SENDER_ID',
  'SERDIPAY_C2B_PATH',
  'SERDIPAY_B2C_PATH',
  'SMS_PROVIDER',
  'MOBILE_MONEY_GATEWAY',
  'AFRICAS_TALKING_USERNAME',
  'AFRICAS_TALKING_API_KEY',
  'AFRICAS_TALKING_ENV',
  'AFRICAS_TALKING_SMS_SENDER',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_UPLOADS_BUCKET',
  'SUPABASE_KYC_BUCKET',
  'CORS_ORIGIN',
  'MOCK_PAYMENTS',
];

console.log(
  'present:',
  needed.filter((k) => !!env[k]).join(', ') || '(none)',
);
console.log(
  'missing:',
  needed.filter((k) => !env[k]).join(', ') || '(none)',
);

if (!env.SERDIPAY_CLIENT_ID || !env.SERDIPAY_CLIENT_SECRET) {
  console.error('SERDIPAY_CLIENT_ID/SECRET missing in external-apis.env — abort');
  process.exit(1);
}

const targets = {
  'srv-d8slrk8js32c73dac310': [
    'SERDIPAY_CLIENT_ID',
    'SERDIPAY_CLIENT_SECRET',
    'SERDIPAY_MERCHANT_ID',
    'SERDIPAY_WEBHOOK_SECRET',
    'SERDIPAY_BASE_URL',
    'SERDIPAY_TOKEN_PATH',
    'SERDIPAY_SMS_PATH',
    'SERDIPAY_SMS_BASE_URL',
    'SERDIPAY_SMS_API_ID',
    'SERDIPAY_SMS_API_KEY',
    'SERDIPAY_SMS_SENDER_ID',
    'SMS_PROVIDER',
    'MOBILE_MONEY_GATEWAY',
    'AFRICAS_TALKING_USERNAME',
    'AFRICAS_TALKING_API_KEY',
    'AFRICAS_TALKING_ENV',
    'AFRICAS_TALKING_SMS_SENDER',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_UPLOADS_BUCKET',
    'SUPABASE_KYC_BUCKET',
  ],
  'srv-d8slrlernols73b4bcq0': [
    'SERDIPAY_CLIENT_ID',
    'SERDIPAY_CLIENT_SECRET',
    'SERDIPAY_MERCHANT_ID',
    'SERDIPAY_WEBHOOK_SECRET',
    'SERDIPAY_BASE_URL',
    'SERDIPAY_SMS_PATH',
    'SERDIPAY_SMS_BASE_URL',
    'SERDIPAY_SMS_API_ID',
    'SERDIPAY_SMS_API_KEY',
    'SERDIPAY_SMS_SENDER_ID',
    'SMS_PROVIDER',
    'MOBILE_MONEY_GATEWAY',
    'AFRICAS_TALKING_USERNAME',
    'AFRICAS_TALKING_API_KEY',
    'AFRICAS_TALKING_ENV',
    'AFRICAS_TALKING_SMS_SENDER',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_UPLOADS_BUCKET',
    'SUPABASE_KYC_BUCKET',
  ],
  'srv-d8slrm8g4nts73bq9pj0': [
    'SERDIPAY_CLIENT_ID',
    'SERDIPAY_CLIENT_SECRET',
    'SERDIPAY_MERCHANT_ID',
    'SERDIPAY_WEBHOOK_SECRET',
    'SERDIPAY_BASE_URL',
    'SERDIPAY_C2B_PATH',
    'SERDIPAY_B2C_PATH',
    'MOBILE_MONEY_GATEWAY',
    'MOCK_PAYMENTS',
  ],
  'srv-d8slrosm0tmc739cnnvg': [
    'SERDIPAY_CLIENT_ID',
    'SERDIPAY_CLIENT_SECRET',
    'SERDIPAY_MERCHANT_ID',
    'SERDIPAY_BASE_URL',
    'SERDIPAY_SMS_PATH',
    'SERDIPAY_SMS_BASE_URL',
    'SERDIPAY_SMS_API_ID',
    'SERDIPAY_SMS_API_KEY',
    'SERDIPAY_SMS_SENDER_ID',
    'SMS_PROVIDER',
    'AFRICAS_TALKING_USERNAME',
    'AFRICAS_TALKING_API_KEY',
    'AFRICAS_TALKING_ENV',
    'AFRICAS_TALKING_SMS_SENDER',
  ],
  'srv-d8slprv7f7vs73d2qn50': ['CORS_ORIGIN'],
};

for (const [id, ks] of Object.entries(targets)) {
  let n = 0;
  for (const k of ks) {
    if (await put(id, k, env[k])) n += 1;
  }
  console.log(`${id} upserted ${n} keys`);
}

console.log('Done. Redeploy auth (and dependents) for changes to apply.');
