/**
 * Exemple minimal — POST /v1/sms/send vers sms.afri-soft.com
 *
 *   AFRISOFT_SMS_HUB_URL=https://sms.afri-soft.com
 *   AFRISOFT_HUB_APP_ID=educongo
 *   AFRISOFT_HUB_API_KEY=…   # jamais dans git
 *   PHONE=243970000001
 *   node send-sms.example.mjs
 */
import crypto from 'node:crypto';

const base = (process.env.AFRISOFT_SMS_HUB_URL || 'https://sms.afri-soft.com').replace(/\/$/, '');
const appId = (process.env.AFRISOFT_HUB_APP_ID || '').trim().toLowerCase();
const apiKey = process.env.AFRISOFT_HUB_API_KEY || '';
const phone = process.env.PHONE || '243970000001';
const code = String(crypto.randomInt(100000, 999999));

if (!appId || !apiKey) {
  console.error('Définir AFRISOFT_HUB_APP_ID et AFRISOFT_HUB_API_KEY (fichier .env privé).');
  process.exit(1);
}

const path = '/v1/sms/send';
const payload = {
  app_id: appId,
  phone,
  text: `Votre code ${appId} : ${code} Valide 5 minutes`,
  reference: `${appId}_login_${crypto.randomUUID()}`,
  idempotency_key: `${appId}:login:${phone}:${Math.floor(Date.now() / 300000)}`,
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

console.log('OTP local (ne loggez pas ça en prod):', code);
console.log(res.status, await res.json());
