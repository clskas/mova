/**
 * AfriSoft SMS Hub — OTP smoke (MOCK-friendly).
 *
 * Usage (PowerShell):
 *   $env:AFRISOFT_SMS_BASE = "https://sms.afri-soft.com"
 *   $env:AFRISOFT_APP_ID = "senga"          # or educongo
 *   $env:AFRISOFT_API_KEY = "<from VPS /opt/afrisoft-sms/.env AFRISOFT_HUB_APPS>"
 *   $env:PHONE = "+243978685317"
 *   node scripts/sms-hub-otp-smoke.mjs
 *
 * Auth (same key for Api-Key header AND HMAC):
 *   string_to_sign = "{timestamp}.{METHOD}.{path}.{raw_body}"
 *   signature      = hex(HMAC_SHA256(api_key, string_to_sign))
 *
 * Headers:
 *   X-AfriSoft-App-Id, X-AfriSoft-Api-Key, X-AfriSoft-Timestamp, X-AfriSoft-Signature
 *
 * MOCK: SMS_PROVIDER=mock + MOCK_RETURN_CODE=true → response includes debug_code (e.g. 123456).
 *       MOCK_FIXED_OTP / MOCK_OTP_CODE=123456 → fixed code for verify.
 */

import crypto from 'node:crypto';

const base = (process.env.AFRISOFT_SMS_BASE || 'https://sms.afri-soft.com').replace(/\/$/, '');
const appId = (process.env.AFRISOFT_APP_ID || 'senga').trim().toLowerCase();
const apiKey = process.env.AFRISOFT_API_KEY || '';
const phone = process.env.PHONE || '+243978685317';
const purpose = process.env.PURPOSE || 'login';
const codeOverride = process.env.OTP_CODE || '';

if (!apiKey) {
  console.error('Set AFRISOFT_API_KEY (from VPS /opt/afrisoft-sms/.env → AFRISOFT_HUB_APPS).');
  process.exit(1);
}

async function hubPost(path, payload) {
  const body = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const stringToSign = `${ts}.POST.${path}.${body}`;
  const signature = crypto.createHmac('sha256', apiKey).update(stringToSign).digest('hex');
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AfriSoft-App-Id': appId,
      'X-AfriSoft-Api-Key': apiKey,
      'X-AfriSoft-Timestamp': ts,
      'X-AfriSoft-Signature': signature,
    },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  console.log(`\nPOST ${path} → ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!res.ok) {
    throw new Error(`Hub error ${res.status}`);
  }
  return json;
}

const reference = `${appId}_${purpose}_${crypto.randomUUID()}`;

console.log(`Base: ${base}`);
console.log(`App:  ${appId}`);
console.log(`Phone:${phone}`);
console.log(`Ref:  ${reference}`);

const health = await fetch(`${base}/health`).then((r) => r.json());
console.log('\nGET /health');
console.log(JSON.stringify(health, null, 2));

const send = await hubPost('/v1/otp/send', {
  app_id: appId,
  phone,
  purpose,
  locale: 'fr',
  reference,
});

const code = codeOverride || send.debug_code || '123456';
console.log(`\nVerifying with code: ${code}`);

const verify = await hubPost('/v1/otp/verify', {
  app_id: appId,
  phone,
  code,
  reference,
});

if (!verify.verified) {
  console.error('\nVERIFY FAILED');
  process.exit(2);
}
console.log('\nSMOKE OK');
