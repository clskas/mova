#!/usr/bin/env node
/**
 * Ops: reverse ledger-only admin CREDITS (apport virtuel) on SENGA treasury.
 * Idempotent — same as POST /api/admin/wallet/treasury/reverse-virtual-float
 * and migration 20260910130000_reverse_virtual_treasury_float.
 *
 * Usage:
 *   ADMIN_API_URL=https://api.afri-soft.com ADMIN_TOKEN=<jwt> node scripts/zero-virtual-treasury-float.mjs
 *   # or
 *   PAYMENT_SERVICE_URL=https://… PAYMENT… INTERNAL_API_KEY=… node scripts/zero-virtual-treasury-float.mjs
 *
 * Platform wallet userId: 00000000-0000-4000-8000-mova00000001
 */
const REVERSE_PATH_ADMIN = '/api/admin/wallet/treasury/reverse-virtual-float';
const REVERSE_PATH_INTERNAL = '/internal/wallets/platform/reverse-virtual-float';

async function main() {
  const adminUrl = (process.env.ADMIN_API_URL || '').replace(/\/$/, '');
  const token = process.env.ADMIN_TOKEN || '';
  const paymentUrl = (process.env.PAYMENT_SERVICE_URL || '').replace(/\/$/, '');
  const internalKey = process.env.INTERNAL_API_KEY || '';

  let url;
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

  if (adminUrl && token) {
    url = `${adminUrl}${REVERSE_PATH_ADMIN}`;
    headers.Authorization = `Bearer ${token}`;
  } else if (paymentUrl && internalKey) {
    url = `${paymentUrl}${REVERSE_PATH_INTERNAL}`;
    headers['x-internal-api-key'] = internalKey;
  } else {
    console.error(
      'Set ADMIN_API_URL + ADMIN_TOKEN, or PAYMENT_SERVICE_URL + INTERNAL_API_KEY.',
    );
    process.exit(1);
  }

  const res = await fetch(url, { method: 'POST', headers, body: '{}' });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    console.error('Failed', res.status, data);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
