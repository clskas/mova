/** CinetPay Checkout API — Mobile Money RDC (failover AfriSoft / SENGA).
 *
 * Docs (https://docs.cinetpay.com) :
 * - Init : POST https://api-checkout.cinetpay.com/v2/payment
 * - Check : POST https://api-checkout.cinetpay.com/v2/payment/check
 * - Notify : form-urlencoded POST + header x-token (HMAC-SHA256) → always re-check
 * - Auth : apikey + site_id (secret_key for HMAC only)
 * - RDC methods : OMCD / MPESACD / AIRTELCD (CDF) ; OMCDUSD / MPESACDUSD (USD)
 *
 * UX note : init returns payment_url (hosted checkout). With lock_phone_number +
 * customer_phone_number, DRC operators then push SMS / secret-code confirmation.
 * Unlike SerdiPay C2B, a pure server-side USSD push without opening a URL is not
 * the documented primary path.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { EnvGetter, MobileMoneyOperator } from './africas-talking';

export const CINETPAY_ENV_KEYS = {
  apiKey: 'CINETPAY_API_KEY',
  siteId: 'CINETPAY_SITE_ID',
  /** HMAC secret for notify x-token (Integrations → secret_key). */
  secretKey: 'CINETPAY_SECRET_KEY',
  notifyUrl: 'CINETPAY_NOTIFY_URL',
  returnUrl: 'CINETPAY_RETURN_URL',
  /** PROD | TEST — informational; checkout API host is the same. */
  env: 'CINETPAY_ENV',
  baseUrl: 'CINETPAY_BASE_URL',
  currency: 'CINETPAY_CURRENCY',
  mobileMoneyGateway: 'MOBILE_MONEY_GATEWAY',
} as const;

const DEFAULT_BASE_URL = 'https://api-checkout.cinetpay.com';

function firstEnv(get: EnvGetter, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = get(key)?.trim();
    if (v) return v;
  }
  return undefined;
}

export function isCinetPayConfigured(get: EnvGetter): boolean {
  return Boolean(
    firstEnv(get, CINETPAY_ENV_KEYS.apiKey) && firstEnv(get, CINETPAY_ENV_KEYS.siteId),
  );
}

/** Sticky switch — no silent fallback to SerdiPay / AT. */
export function useCinetPayMobileMoney(get: EnvGetter): boolean {
  const gateway = (get(CINETPAY_ENV_KEYS.mobileMoneyGateway) ?? 'serdipay').trim().toLowerCase();
  return gateway === 'cinetpay' && isCinetPayConfigured(get);
}

function baseUrl(get: EnvGetter): string {
  return (firstEnv(get, CINETPAY_ENV_KEYS.baseUrl) || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function currency(get: EnvGetter): 'CDF' | 'USD' {
  const c = (firstEnv(get, CINETPAY_ENV_KEYS.currency) || 'CDF').toUpperCase();
  return c === 'USD' ? 'USD' : 'CDF';
}

/** E.164 with leading + (CinetPay examples: +243…). */
export function cinetPayNormalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  let normalized = digits;
  if (digits.startsWith('243')) normalized = digits;
  else if (digits.startsWith('0') && digits.length >= 9) normalized = `243${digits.slice(1)}`;
  return normalized.startsWith('+') ? normalized : `+${normalized}`;
}

/** Amount must be a multiple of 5 (CinetPay rule). */
export function cinetPayNormalizeAmount(amount: number): number {
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const rem = n % 5;
  if (rem === 0) return n;
  return n + (5 - rem);
}

/** Sanitize description — avoid # / $ _ & per CinetPay docs. */
export function cinetPaySanitizeDescription(text: string): string {
  return text
    .replace(/[#/$&_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * Map SENGA / hub operator → CinetPay payment_method code (DRC).
 * CDF: OMCD | MPESACD | AIRTELCD ; USD: OMCDUSD | MPESACDUSD (Airtel USD not in public table).
 */
export function cinetPayPaymentMethod(
  operator: MobileMoneyOperator | string,
  curr: 'CDF' | 'USD' = 'CDF',
): string {
  const usd = curr === 'USD';
  switch (operator) {
    case 'ORANGE_MONEY':
    case 'OM':
      return usd ? 'OMCDUSD' : 'OMCD';
    case 'MPESA':
    case 'MP':
      return usd ? 'MPESACDUSD' : 'MPESACD';
    case 'AIRTEL_MONEY':
    case 'AM':
      return usd ? 'AIRTELCD' : 'AIRTELCD';
    default:
      return String(operator);
  }
}

/**
 * HMAC x-token payload — fixed field order from CinetPay docs.
 * https://docs.cinetpay.com/api/1.0-en/checkout/hmac
 */
export const CINETPAY_HMAC_FIELDS = [
  'cpm_site_id',
  'cpm_trans_id',
  'cpm_trans_date',
  'cpm_amount',
  'cpm_currency',
  'signature',
  'payment_method',
  'cel_phone_num',
  'cpm_phone_prefixe',
  'cpm_language',
  'cpm_version',
  'cpm_payment_config',
  'cpm_page_action',
  'cpm_custom',
  'cpm_designation',
  'cpm_error_message',
] as const;

export function cinetPayBuildHmacPayload(fields: Record<string, unknown>): string {
  return CINETPAY_HMAC_FIELDS.map((k) => {
    const v = fields[k];
    if (v === undefined || v === null) return '';
    return String(v);
  }).join('');
}

export function cinetPayGenerateXToken(secretKey: string, fields: Record<string, unknown>): string {
  const data = cinetPayBuildHmacPayload(fields);
  return createHmac('sha256', secretKey).update(data).digest('hex');
}

export function cinetPayVerifyXToken(
  secretKey: string,
  fields: Record<string, unknown>,
  receivedToken: string,
): boolean {
  if (!secretKey || !receivedToken) return false;
  const expected = cinetPayGenerateXToken(secretKey, fields);
  try {
    const a = Buffer.from(receivedToken.trim(), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return receivedToken.trim() === expected;
  }
}

export type CinetPayMmResult = {
  success: boolean;
  pending?: boolean;
  transactionId: string;
  providerRef: string;
  /** Hosted checkout URL — open in WebView / browser when present. */
  paymentUrl?: string;
  paymentToken?: string;
  message?: string;
};

export type CinetPayCheckStatus = 'ACCEPTED' | 'REFUSED' | 'PENDING' | 'UNKNOWN';

export type CinetPayCheckResult = {
  ok: boolean;
  status: CinetPayCheckStatus;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  operatorId?: string;
  message?: string;
  raw?: unknown;
};

function credentials(get: EnvGetter):
  | { ok: true; apiKey: string; siteId: string | number }
  | { ok: false; message: string } {
  if (!isCinetPayConfigured(get)) {
    return {
      ok: false,
      message:
        'CinetPay non configuré. Définissez CINETPAY_API_KEY, CINETPAY_SITE_ID ' +
        '(+ CINETPAY_NOTIFY_URL, CINETPAY_SECRET_KEY recommandé) et MOBILE_MONEY_GATEWAY=cinetpay.',
    };
  }
  const apiKey = firstEnv(get, CINETPAY_ENV_KEYS.apiKey)!;
  const siteRaw = firstEnv(get, CINETPAY_ENV_KEYS.siteId)!;
  const siteNum = Number(siteRaw);
  const siteId = Number.isFinite(siteNum) && String(siteNum) === siteRaw ? siteNum : siteRaw;
  return { ok: true, apiKey, siteId };
}

function toProviderRef(transactionId: string): string {
  const id = String(transactionId);
  return id.startsWith('cp_') ? id : `cp_${id}`;
}

/** Strip cp_ prefix for CinetPay transaction_id lookups. */
export function cinetPayTransactionIdFromProviderRef(providerRef: string): string {
  const r = providerRef.trim();
  return r.startsWith('cp_') ? r.slice(3) : r;
}

export function cinetPayMapCheckStatus(raw?: string): CinetPayCheckStatus {
  if (!raw) return 'UNKNOWN';
  const s = raw.trim().toUpperCase();
  if (s === 'ACCEPTED' || s === 'SUCCESS' || s === 'SUCCESSFUL' || s === 'COMPLETED') return 'ACCEPTED';
  if (s === 'REFUSED' || s === 'FAILED' || s === 'CANCELLED' || s === 'CANCELED' || s === 'REJECTED') {
    return 'REFUSED';
  }
  if (s === 'PENDING' || s === 'WAITING_CUSTOMER_PAYMENT' || s === 'WAITING' || s === 'CREATED') {
    return 'PENDING';
  }
  return 'UNKNOWN';
}

/**
 * Init checkout (MOBILE_MONEY). Returns payment_url for client redirect / WebView.
 * transaction_id = merchant reference (unique). Stored providerRef = cp_{transaction_id}.
 */
export async function cinetPayInitiateMobileMoney(
  get: EnvGetter,
  params: {
    operator: MobileMoneyOperator | string;
    amountCdf: number;
    phone: string;
    reference: string;
    description?: string;
  },
): Promise<CinetPayMmResult> {
  const creds = credentials(get);
  if (creds.ok === false) {
    return { success: false, transactionId: '', providerRef: '', message: creds.message };
  }

  const notifyUrl = firstEnv(get, CINETPAY_ENV_KEYS.notifyUrl);
  if (!notifyUrl) {
    return {
      success: false,
      transactionId: '',
      providerRef: '',
      message:
        'CINETPAY_NOTIFY_URL manquant. Ex. https://pay.afri-soft.com/webhooks/cinetpay',
    };
  }

  const curr = currency(get);
  const amount = cinetPayNormalizeAmount(params.amountCdf);
  if (amount < 100 && curr === 'CDF') {
    return {
      success: false,
      transactionId: '',
      providerRef: '',
      message: 'Montant CinetPay CDF minimum indicatif : 100 (multiple de 5).',
    };
  }

  const transactionId = params.reference.trim().slice(0, 100);
  const returnUrl =
    firstEnv(get, CINETPAY_ENV_KEYS.returnUrl) ||
    notifyUrl.replace(/\/webhooks\/cinetpay\/?$/i, '/').replace(/\/$/, '') ||
    notifyUrl;
  const phone = cinetPayNormalizePhone(params.phone);
  const description = cinetPaySanitizeDescription(
    params.description ?? `Paiement SENGA ${params.reference}`,
  );

  const body: Record<string, unknown> = {
    apikey: creds.apiKey,
    site_id: creds.siteId,
    transaction_id: transactionId,
    amount,
    currency: curr,
    description,
    notify_url: notifyUrl,
    return_url: returnUrl,
    channels: 'MOBILE_MONEY',
    lang: 'fr',
    metadata: params.reference,
    customer_phone_number: phone,
    lock_phone_number: true,
  };

  try {
    const res = await fetch(`${baseUrl(get)}/v2/payment`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      code?: string | number;
      message?: string;
      description?: string;
      data?: {
        payment_url?: string;
        payment_token?: string;
      };
      payment_url?: string;
    };

    const code = data.code != null ? String(data.code) : '';
    const paymentUrl = data.data?.payment_url ?? data.payment_url;
    const paymentToken = data.data?.payment_token;
    const created = code === '201' || code === '00' || Boolean(paymentUrl);

    if (!res.ok || !created || !paymentUrl) {
      return {
        success: false,
        transactionId: '',
        providerRef: '',
        message:
          data.description ??
          data.message ??
          `Échec init CinetPay (${res.status}${code ? ` code ${code}` : ''})`,
      };
    }

    const providerRef = toProviderRef(transactionId);
    return {
      success: true,
      pending: true,
      transactionId,
      providerRef,
      paymentUrl,
      paymentToken,
      message:
        data.description ??
        data.message ??
        'Ouvrez la page de paiement puis confirmez sur votre téléphone Mobile Money.',
    };
  } catch {
    return {
      success: false,
      transactionId: '',
      providerRef: '',
      message: 'Service Mobile Money CinetPay temporairement indisponible.',
    };
  }
}

/** Verify transaction status (mandatory after notify). */
export async function cinetPayCheckTransaction(
  get: EnvGetter,
  transactionId: string,
): Promise<CinetPayCheckResult> {
  const creds = credentials(get);
  if (creds.ok === false) {
    return { ok: false, status: 'UNKNOWN', message: creds.message };
  }
  const id = cinetPayTransactionIdFromProviderRef(transactionId);
  if (!id) {
    return { ok: false, status: 'UNKNOWN', message: 'transaction_id manquant' };
  }

  try {
    const res = await fetch(`${baseUrl(get)}/v2/payment/check`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apikey: creds.apiKey,
        site_id: creds.siteId,
        transaction_id: id,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      code?: string | number;
      message?: string;
      description?: string;
      data?: {
        amount?: string | number;
        currency?: string;
        status?: string;
        payment_method?: string;
        operator_id?: string;
      };
    };
    const status = cinetPayMapCheckStatus(data.data?.status);
    const codeOk = data.code != null && String(data.code) === '00';
    return {
      ok: res.ok && (codeOk || status !== 'UNKNOWN'),
      status,
      amount: data.data?.amount != null ? Number(data.data.amount) : undefined,
      currency: data.data?.currency,
      paymentMethod: data.data?.payment_method,
      operatorId: data.data?.operator_id,
      message: data.description ?? data.message,
      raw: data,
    };
  } catch {
    return {
      ok: false,
      status: 'UNKNOWN',
      message: 'Vérification CinetPay temporairement indisponible.',
    };
  }
}
