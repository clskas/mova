/**
 * AfriSoft Payment Hub client + HMAC helpers.
 * Contract: docs/AFRISOFT_PAYMENT_HUB_API.md
 *
 * Render mova-payment MUST call this client (pay.afri-soft.com).
 * Never call serdipay.com from Render (IP not whitelisted — VPS hub only).
 *
 * Env (client / SENGA Render) — any alias works:
 *   PAY_HUB_URL | AFRISOFT_PAY_BASE_URL | AFRISOFT_PAY_HUB_URL = https://pay.afri-soft.com
 *   AFRISOFT_HUB_APP_ID | AFRISOFT_PAY_HUB_APP_ID = senga
 *   AFRISOFT_HUB_API_KEY | AFRISOFT_PAY_HUB_API_KEY
 *
 * Env (VPS hub process):
 *   AFRISOFT_PAY_HUB_MODE=true
 *   AFRISOFT_HUB_APPS=senga:<key>,...
 */

import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { serdiPayNormalizePhone, serdiPayTelecomCode } from './serdipay';
import type { EnvGetter, MobileMoneyOperator } from './africas-talking';

const DEFAULT_HUB_URL = 'https://pay.afri-soft.com';
const MAX_SKEW_SEC = 300;

function firstEnv(get: EnvGetter, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = get(key)?.trim();
    if (v) return v;
  }
  return undefined;
}

export function afrisoftPayHubBaseUrl(get: EnvGetter): string {
  return (
    firstEnv(get, 'PAY_HUB_URL', 'AFRISOFT_PAY_BASE_URL', 'AFRISOFT_PAY_HUB_URL') || DEFAULT_HUB_URL
  ).replace(/\/$/, '');
}

/** True when this process is the VPS hub (talks to SerdiPay). */
export function isAfrisoftPayHubMode(get: EnvGetter): boolean {
  const v = (get('AFRISOFT_PAY_HUB_MODE') ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/** True when SENGA/app should call the hub over HTTPS+HMAC. */
export function isAfrisoftPayHubClientConfigured(get: EnvGetter): boolean {
  const url = firstEnv(get, 'PAY_HUB_URL', 'AFRISOFT_PAY_BASE_URL', 'AFRISOFT_PAY_HUB_URL');
  const appId = firstEnv(get, 'AFRISOFT_HUB_APP_ID', 'AFRISOFT_PAY_HUB_APP_ID');
  const apiKey = firstEnv(get, 'AFRISOFT_HUB_API_KEY', 'AFRISOFT_PAY_HUB_API_KEY');
  return Boolean(url && appId && apiKey);
}

export const isAfriSoftPayHubConfigured = isAfrisoftPayHubClientConfigured;

export function afrisoftHubAppId(get: EnvGetter): string {
  return (firstEnv(get, 'AFRISOFT_HUB_APP_ID', 'AFRISOFT_PAY_HUB_APP_ID') || 'senga').toLowerCase();
}

export function afrisoftHubApiKey(get: EnvGetter): string | undefined {
  return firstEnv(get, 'AFRISOFT_HUB_API_KEY', 'AFRISOFT_PAY_HUB_API_KEY');
}

export function afrisoftHubWebhookSecret(get: EnvGetter): string | undefined {
  return firstEnv(get, 'AFRISOFT_HUB_WEBHOOK_SECRET', 'AFRISOFT_PAY_HUB_WEBHOOK_SECRET') || afrisoftHubApiKey(get);
}

export function isAfrisoftHubAsyncRef(providerRef?: string | null): boolean {
  if (!providerRef) return false;
  return /^(sp_|cp_|at_|pay_|senga_)/i.test(providerRef);
}

export function afrisoftPayHubOperator(telecom: string): MobileMoneyOperator {
  const t = telecom.trim().toUpperCase();
  if (t === 'MP' || t === 'MPESA') return 'MPESA';
  if (t === 'AM' || t === 'AF' || t === 'AIRTEL_MONEY' || t === 'AIRTEL') return 'AIRTEL_MONEY';
  return 'ORANGE_MONEY';
}

export function afrisoftHubReference(appId: string, purpose: string, uuid = randomUUID()): string {
  const app = appId.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'senga';
  const p = purpose.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'pay';
  return `${app}_${p}_${uuid.toLowerCase()}`;
}

export const afrisoftHubPaymentReference = afrisoftHubReference;

export function afrisoftHubPublicPath(originalUrl: string): string {
  const path = (originalUrl.split('?')[0] || '/').trim() || '/';
  if (path.startsWith('/api/v1/')) return path.slice(4);
  return path;
}

export function afrisoftHubSign(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  rawBody: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${method.toUpperCase()}.${path}.${rawBody}`)
    .digest('hex');
}

export function afrisoftPayHubSign(params: {
  apiKey: string;
  timestamp: string;
  method: string;
  path: string;
  rawBody: string;
}): string {
  return afrisoftHubSign(params.apiKey, params.timestamp, params.method, params.path, params.rawBody);
}

export function afrisoftHubTimestampFresh(
  timestamp: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(nowSec - ts) <= MAX_SKEW_SEC;
}

export function afrisoftHubVerifySignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  rawBody: string,
  providedHex: string,
): boolean {
  const expected = afrisoftHubSign(secret, timestamp, method, path, rawBody);
  const a = Buffer.from(providedHex.trim().toLowerCase(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function afrisoftPayHubVerifySignature(params: {
  secret: string;
  timestamp: string;
  method: string;
  path: string;
  rawBody: string;
  signature: string;
}): boolean {
  if (!afrisoftHubTimestampFresh(params.timestamp)) return false;
  const publicPath = afrisoftHubPublicPath(params.path);
  return (
    afrisoftHubVerifySignature(
      params.secret,
      params.timestamp,
      params.method,
      publicPath,
      params.rawBody,
      params.signature,
    ) ||
    (publicPath !== params.path &&
      afrisoftHubVerifySignature(
        params.secret,
        params.timestamp,
        params.method,
        params.path.split('?')[0],
        params.rawBody,
        params.signature,
      ))
  );
}

export type AfriSoftHubPaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface AfriSoftHubInitiateParams {
  amountCdf: number;
  phone: string;
  operator?: MobileMoneyOperator | string;
  telecom?: string;
  reference?: string;
  purpose?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  kind?: 'C2B' | 'B2C';
}

export interface AfriSoftHubPaymentResult {
  success: boolean;
  pending?: boolean;
  paymentId?: string;
  transactionId?: string;
  providerRef?: string;
  paymentUrl?: string;
  status?: AfriSoftHubPaymentStatus;
  reference?: string;
  amountCdf?: number;
  telecom?: string;
  message?: string;
  completedAt?: string;
}

function hubCreds(get: EnvGetter): { baseUrl: string; appId: string; apiKey: string } | null {
  const appId = afrisoftHubAppId(get);
  const apiKey = afrisoftHubApiKey(get);
  if (!appId || !apiKey) return null;
  if (!firstEnv(get, 'PAY_HUB_URL', 'AFRISOFT_PAY_BASE_URL', 'AFRISOFT_PAY_HUB_URL')) return null;
  return { baseUrl: afrisoftPayHubBaseUrl(get), appId, apiKey };
}

async function hubFetch(
  get: EnvGetter,
  method: 'GET' | 'POST',
  path: string,
  bodyObj?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const creds = hubCreds(get);
  if (!creds) {
    return {
      ok: false,
      status: 0,
      json: {
        message:
          'Hub AfriSoft non configuré (PAY_HUB_URL / AFRISOFT_PAY_HUB_URL, AFRISOFT_HUB_APP_ID, AFRISOFT_HUB_API_KEY).',
      },
    };
  }
  const rawBody = method === 'GET' || !bodyObj ? '' : JSON.stringify(bodyObj);
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = afrisoftHubSign(creds.apiKey, ts, method, path, rawBody);
  try {
    const res = await fetch(`${creds.baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-AfriSoft-App-Id': creds.appId,
        'X-AfriSoft-Api-Key': creds.apiKey,
        'X-AfriSoft-Timestamp': ts,
        'X-AfriSoft-Signature': sig,
      },
      ...(rawBody ? { body: rawBody } : {}),
    });
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = {};
    }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return {
      ok: false,
      status: 0,
      json: { message: 'Hub paiements AfriSoft temporairement indisponible.' },
    };
  }
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function mapHubJson(json: Record<string, unknown>, fallbackMsg: string): AfriSoftHubPaymentResult {
  const statusRaw = pickStr(json, ['status'])?.toUpperCase();
  const status: AfriSoftHubPaymentStatus | undefined =
    statusRaw === 'COMPLETED' || statusRaw === 'FAILED' || statusRaw === 'PENDING'
      ? statusRaw
      : undefined;
  const paymentId = pickStr(json, ['payment_id', 'paymentId']);
  const aggregatorRef = pickStr(json, ['provider_ref', 'providerRef']);
  const providerRef = paymentId ?? aggregatorRef;
  const message = pickStr(json, ['message', 'error', 'failure_reason']) ?? fallbackMsg;
  const amount = json.amount_cdf ?? json.amountCdf;
  return {
    success: status !== 'FAILED' && Boolean(paymentId || providerRef),
    pending: status === 'PENDING' || (!status && Boolean(paymentId || providerRef)),
    paymentId,
    transactionId: paymentId ?? providerRef,
    providerRef,
    paymentUrl: pickStr(json, ['payment_url', 'paymentUrl']),
    status: status ?? 'PENDING',
    reference: pickStr(json, ['reference']),
    amountCdf: typeof amount === 'number' ? amount : undefined,
    telecom: pickStr(json, ['telecom']),
    message,
    completedAt: pickStr(json, ['completed_at', 'completedAt']),
  };
}

export async function afrisoftPayHubInitiate(
  get: EnvGetter,
  params: AfriSoftHubInitiateParams,
): Promise<AfriSoftHubPaymentResult> {
  const creds = hubCreds(get);
  if (!creds) {
    return {
      success: false,
      message:
        'Hub AfriSoft non configuré. Définissez PAY_HUB_URL (ou AFRISOFT_PAY_HUB_URL), AFRISOFT_HUB_APP_ID, AFRISOFT_HUB_API_KEY.',
    };
  }
  const telecom = (params.telecom || serdiPayTelecomCode(params.operator ?? 'ORANGE_MONEY')).toUpperCase();
  const purpose = params.purpose || (params.kind === 'B2C' ? 'withdraw' : 'pay');
  const reference = params.reference || afrisoftHubReference(creds.appId, purpose);
  const path = params.kind === 'B2C' ? '/v1/payouts' : '/v1/payments';
  const body = {
    app_id: creds.appId,
    amount_cdf: params.amountCdf,
    currency: 'CDF',
    phone: serdiPayNormalizePhone(params.phone),
    telecom,
    reference,
    purpose,
    ...(params.metadata ? { metadata: params.metadata } : {}),
    ...(params.idempotencyKey ? { idempotency_key: params.idempotencyKey } : {}),
  };
  const { ok, json } = await hubFetch(get, 'POST', path, body);
  if (!ok) {
    return {
      success: false,
      message: pickStr(json, ['message', 'error']) ?? 'Échec de l’initiation Mobile Money via le hub AfriSoft.',
    };
  }
  const mapped = mapHubJson(json, 'Confirmez le paiement sur votre téléphone Mobile Money.');
  if (!mapped.success) {
    return { ...mapped, success: false, message: mapped.message };
  }
  return {
    ...mapped,
    success: true,
    pending: mapped.status !== 'COMPLETED',
    reference: mapped.reference ?? reference,
  };
}

export const afrisoftPayHubInitiatePayment = afrisoftPayHubInitiate;

export async function afrisoftPayHubGetStatus(
  get: EnvGetter,
  lookup: { paymentId?: string; reference?: string },
): Promise<AfriSoftHubPaymentResult> {
  const path = lookup.paymentId
    ? `/v1/payments/${encodeURIComponent(lookup.paymentId)}`
    : lookup.reference
      ? `/v1/payments/by-reference/${encodeURIComponent(lookup.reference)}`
      : '';
  if (!path) {
    return { success: false, message: 'payment_id ou reference requis' };
  }
  const { ok, json } = await hubFetch(get, 'GET', path);
  if (!ok) {
    return {
      success: false,
      message: pickStr(json, ['message', 'error']) ?? 'Paiement introuvable sur le hub.',
    };
  }
  return mapHubJson(json, 'Statut hub');
}

export const afrisoftPayHubGetPayment = async (
  get: EnvGetter,
  lookup: { paymentId?: string; reference?: string } | string,
): Promise<AfriSoftHubPaymentResult> => {
  if (typeof lookup === 'string') {
    if (lookup.startsWith('pay_')) return afrisoftPayHubGetStatus(get, { paymentId: lookup });
    const byRef = await afrisoftPayHubGetStatus(get, { reference: lookup });
    if (byRef.success) return byRef;
    return afrisoftPayHubGetStatus(get, { paymentId: lookup });
  }
  return afrisoftPayHubGetStatus(get, lookup);
};

export async function afrisoftPayHubDisburse(
  get: EnvGetter,
  params: Omit<AfriSoftHubInitiateParams, 'kind'>,
): Promise<AfriSoftHubPaymentResult> {
  return afrisoftPayHubInitiate(get, { ...params, kind: 'B2C', purpose: params.purpose || 'withdraw' });
}

export const afrisoftPayHubInitiatePayout = afrisoftPayHubDisburse;
