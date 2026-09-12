/**
 * Exemple minimal — POST /v1/payouts vers pay.afri-soft.com (B2C)
 *
 *   AFRISOFT_PAY_HUB_URL=https://pay.afri-soft.com
 *   AFRISOFT_HUB_APP_ID=educongo
 *   AFRISOFT_HUB_API_KEY=…   # jamais dans git
 *   PHONE=243970000001
 *   TELECOM=MP
 *   AMOUNT_CDF=2500
 *   node create-payout.example.mjs
 */
import crypto from 'node:crypto';

const base = (process.env.AFRISOFT_PAY_HUB_URL || 'https://pay.afri-soft.com').replace(/\/$/, '');
const appId = (process.env.AFRISOFT_HUB_APP_ID || '').trim().toLowerCase();
const apiKey = process.env.AFRISOFT_HUB_API_KEY || '';
const phone = process.env.PHONE || '243970000001';
const amountCdf = Number(process.env.AMOUNT_CDF || 2500);
const telecom = (process.env.TELECOM || 'MP').toUpperCase();

if (!appId || !apiKey) {
  console.error('Définir AFRISOFT_HUB_APP_ID et AFRISOFT_HUB_API_KEY (fichier .env privé).');
  process.exit(1);
}

const path = '/v1/payouts';
const uuid = crypto.randomUUID();
const payload = {
  app_id: appId,
  amount_cdf: amountCdf,
  currency: 'CDF',
  phone,
  telecom,
  reference: `${appId}_withdraw_${uuid}`,
  purpose: 'withdraw',
  metadata: { demo: true },
  idempotency_key: `${appId}:withdraw:${phone}:${Math.floor(Date.now() / 300000)}`,
};
const body = JSON.stringify(payload);
const ts = String(Math.floor(Date.now() / 1000));
const signature = crypto.createHmac('sha256', apiKey).update(`${ts}.POST.${path}.${body}`).digest('hex');

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

console.log(res.status, await res.json());
