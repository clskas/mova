/**
 * Vérifier un webhook hub → votre app (HMAC).
 *
 *   AFRISOFT_HUB_WEBHOOK_SECRET=…   # ou AFRISOFT_HUB_API_KEY si secret dédié vide
 *   node verify-webhook.example.mjs
 *
 * En prod : lire rawBody depuis la requête HTTP (Buffer / string exacte),
 * headers X-AfriSoft-Timestamp + X-AfriSoft-Signature, path = req.url pathname.
 */
import crypto from 'node:crypto';

const secret = process.env.AFRISOFT_HUB_WEBHOOK_SECRET || process.env.AFRISOFT_HUB_API_KEY || '';
if (!secret) {
  console.error('Définir AFRISOFT_HUB_WEBHOOK_SECRET (ou AFRISOFT_HUB_API_KEY).');
  process.exit(1);
}

/** @param {string} secret @param {string} ts @param {string} method @param {string} path @param {string} rawBody */
function sign(secret, ts, method, path, rawBody) {
  return crypto.createHmac('sha256', secret).update(`${ts}.${method.toUpperCase()}.${path}.${rawBody}`).digest('hex');
}

function verify(secret, ts, method, path, rawBody, providedHex) {
  const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(Number(ts)) || skew > 300) return false;
  const expected = sign(secret, ts, method, path, rawBody);
  const a = Buffer.from(providedHex.trim().toLowerCase(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --- Démo : construire un faux webhook et le vérifier ---
const path = '/webhooks/afrisoft-payments';
const payload = {
  event: 'payment.completed',
  payment_id: 'pay_demo',
  app_id: 'educongo',
  status: 'COMPLETED',
  reference: 'educongo_pay_550e8400-e29b-41d4-a716-446655440000',
  amount_cdf: 2500,
  currency: 'CDF',
  phone: '243970000001',
  telecom: 'MP',
  purpose: 'pay',
  occurred_at: new Date().toISOString(),
};
const rawBody = JSON.stringify(payload);
const ts = String(Math.floor(Date.now() / 1000));
const signature = sign(secret, ts, 'POST', path, rawBody);

console.log('Headers à attendre:');
console.log('  X-AfriSoft-Timestamp:', ts);
console.log('  X-AfriSoft-Signature:', signature);
console.log('  X-AfriSoft-Event: payment.completed');
console.log('verify OK?', verify(secret, ts, 'POST', path, rawBody, signature));

// Pseudo-handler Express :
// app.post('/webhooks/afrisoft-payments', express.raw({ type: '*/*' }), (req, res) => {
//   const raw = req.body.toString('utf8');
//   const ok = verify(secret, req.get('X-AfriSoft-Timestamp'), 'POST',
//     req.originalUrl.split('?')[0], raw, req.get('X-AfriSoft-Signature') || '');
//   if (!ok) return res.status(401).end();
//   const event = JSON.parse(raw);
//   // idempotence + fail-closed amount_cdf + crédit ledger
//   res.status(200).json({ ok: true });
// });
