/** SerdiPay Public API — Mobile Money RDC (passerelle primaire SENGA).
 *
 * The PDF « API USSD - documentation » contains two products:
 * 1) Public API (pp. 1–15) — merchant Mobile Money. Word *SerdipayAPIKey* routes.
 * 2) SERDIPAY USSD (pp. 16–25) — wallet deposit/withdraw `{ username, password, account }`.
 *    Endpoints are placeholders (“Share the Endpoint”); not used for SENGA MM.
 *
 * Public API (this client) :
 * - Hosts from *SerdipayAPIKey* + PDF « API USSD » :
 *   prod https://serdipay.com ; staging https://api.serdipay.cloud.
 *   Do not use https://apis.serdipay.com (not in those files).
 * - Auth : POST /api/public-api/v1/merchant/get-token  { email, password }
 *   Word field is Username (email). A `username`-only body is rejected (400).
 * - Word routes : C2B → …/payment-merchant ; B2C → …/payment-client
 *   body : api_id, api_password, merchantCode, merchant_pin, clientPhone,
 *          amount, currency, telecom (AM|OM|MP|AF)
 *   api_password : same as portal Password in the merchant credential sheet
 *   (no separate "API Password" field). SERDIPAY_API_PASSWORD overrides if set.
 * - Callback : { status, message, payment: { status, sessionId, transactionId } }
 *
 * SMS OTP — doc séparée « SerdiPay SMS API » (sms-api.pdf) :
 * - Auth dans le corps JSON : apiId + apiKey (pas de Bearer / get-token)
 * - POST /api/sms-api/v1/send  { apiId, apiKey, phone, senderId, text }
 * - Prod : https://serdipay.com  | Staging : https://api.serdipay.cloud
 * - Credentials SMS distincts des credentials paiement (email/password).
 */

/** Client-safe OTP SMS copy. Keep under 180 chars — never leak env var names. */
export const SMS_UNAVAILABLE_USER_MESSAGE =
  "Impossible d'envoyer le code par SMS. Réessayez dans quelques minutes.";

export const SERDIPAY_ENV_KEYS = {
  baseUrl: 'SERDIPAY_BASE_URL',
  /** Merchant portal login email (get-token). Alias: SERDIPAY_CLIENT_ID */
  email: 'SERDIPAY_EMAIL',
  /** Merchant portal password (get-token). Alias: SERDIPAY_CLIENT_SECRET */
  password: 'SERDIPAY_PASSWORD',
  /** Legacy aliases kept for existing Render env / docs */
  clientId: 'SERDIPAY_CLIENT_ID',
  clientSecret: 'SERDIPAY_CLIENT_SECRET',
  apiId: 'SERDIPAY_API_ID',
  /** Payment body api_password. Optional: falls back to SERDIPAY_PASSWORD. */
  apiPassword: 'SERDIPAY_API_PASSWORD',
  merchantCode: 'SERDIPAY_MERCHANT_CODE',
  /** Alias for merchantCode */
  merchantId: 'SERDIPAY_MERCHANT_ID',
  merchantPin: 'SERDIPAY_MERCHANT_PIN',
  webhookSecret: 'SERDIPAY_WEBHOOK_SECRET',
  tokenPath: 'SERDIPAY_TOKEN_PATH',
  /** SMS API (doc sms-api.pdf) — distinct from payment SERDIPAY_API_ID */
  smsApiId: 'SERDIPAY_SMS_API_ID',
  smsApiKey: 'SERDIPAY_SMS_API_KEY',
  smsUsername: 'SERDIPAY_SMS_USERNAME',
  smsSenderId: 'SERDIPAY_SMS_SENDER_ID',
  /** Default prod https://serdipay.com ; staging https://api.serdipay.cloud */
  smsBaseUrl: 'SERDIPAY_SMS_BASE_URL',
  /** Default /api/sms-api/v1/send */
  smsPath: 'SERDIPAY_SMS_PATH',
  c2bPath: 'SERDIPAY_C2B_PATH',
  b2cPath: 'SERDIPAY_B2C_PATH',
  smsProvider: 'SMS_PROVIDER',
  mobileMoneyGateway: 'MOBILE_MONEY_GATEWAY',
} as const;

import type { EnvGetter, MobileMoneyOperator } from './africas-talking';

function firstEnv(get: EnvGetter, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = get(key)?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Auth credentials for get-token (email + password). */
export function isSerdiPayAuthConfigured(get: EnvGetter): boolean {
  return Boolean(serdiPayEmail(get) && serdiPayPassword(get));
}

/** Full merchant payment credentials (Public API payment body). */
export function isSerdiPayPaymentConfigured(get: EnvGetter): boolean {
  return Boolean(
    isSerdiPayAuthConfigured(get) &&
      firstEnv(get, SERDIPAY_ENV_KEYS.apiId) &&
      serdiPayApiPassword(get) &&
      serdiPayMerchantCode(get) &&
      firstEnv(get, SERDIPAY_ENV_KEYS.merchantPin),
  );
}

/**
 * True when SerdiPay can be used at all (auth present).
 * Prefer {@link isSerdiPayPaymentConfigured} / {@link isSerdiPaySmsConfigured}
 * for specific channels.
 */
export function isSerdiPayConfigured(get: EnvGetter): boolean {
  return isSerdiPayAuthConfigured(get);
}

/** SMS API credentials (sms-api.pdf: apiId + apiKey). Independent of payment auth. */
export function isSerdiPaySmsConfigured(get: EnvGetter): boolean {
  return Boolean(
    firstEnv(get, SERDIPAY_ENV_KEYS.smsApiId) && firstEnv(get, SERDIPAY_ENV_KEYS.smsApiKey),
  );
}

export function useSerdiPayMobileMoney(get: EnvGetter): boolean {
  const gateway = (get(SERDIPAY_ENV_KEYS.mobileMoneyGateway) ?? 'serdipay').trim().toLowerCase();
  return gateway === 'serdipay' && isSerdiPayPaymentConfigured(get);
}

function serdiPayEmail(get: EnvGetter): string | undefined {
  return firstEnv(get, SERDIPAY_ENV_KEYS.email, SERDIPAY_ENV_KEYS.clientId);
}

function serdiPayPassword(get: EnvGetter): string | undefined {
  return firstEnv(get, SERDIPAY_ENV_KEYS.password, SERDIPAY_ENV_KEYS.clientSecret);
}

function serdiPayMerchantCode(get: EnvGetter): string | undefined {
  return firstEnv(get, SERDIPAY_ENV_KEYS.merchantCode, SERDIPAY_ENV_KEYS.merchantId);
}

/**
 * Public API payment body `api_password`.
 * Merchant sheets (SerdipayAPIKey) list Password, not a separate API password —
 * default to the portal password used by get-token.
 */
function serdiPayApiPassword(get: EnvGetter): string | undefined {
  return firstEnv(
    get,
    SERDIPAY_ENV_KEYS.apiPassword,
    SERDIPAY_ENV_KEYS.password,
    SERDIPAY_ENV_KEYS.clientSecret,
  );
}

function baseUrl(get: EnvGetter): string {
  return (get(SERDIPAY_ENV_KEYS.baseUrl)?.trim() || 'https://serdipay.com').replace(/\/$/, '');
}

function pathOr(get: EnvGetter, key: keyof typeof SERDIPAY_ENV_KEYS, fallback: string): string {
  const raw = get(SERDIPAY_ENV_KEYS[key])?.trim();
  if (!raw) return fallback;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/** Doc payment uses 243… without leading +. */
export function serdiPayNormalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('243')) return digits;
  if (digits.startsWith('0') && digits.length >= 9) return `243${digits.slice(1)}`;
  return digits;
}

/** SMS API examples use E.164 with leading + (e.g. +243…). */
export function serdiPayNormalizeSmsPhone(phone: string): string {
  const digits = serdiPayNormalizePhone(phone);
  return digits.startsWith('+') ? digits : `+${digits}`;
}

/**
 * SerdiPay/Dream Digital returns HTTP 400 "An error occor while processing the sms"
 * when `text` contains a sentence-ending period (`.` followed by space or end).
 * Keep decimals (`50.00`) and abbreviations (`No.Jeton`).
 */
export function serdiPaySanitizeSmsText(text: string): string {
  return text.replace(/\.(\s|$)/g, ' $1').replace(/\s+/g, ' ').trim();
}

function smsBaseUrl(get: EnvGetter): string {
  return (get(SERDIPAY_ENV_KEYS.smsBaseUrl)?.trim() || 'https://serdipay.com').replace(/\/$/, '');
}

/** Telecom codes from SerdiPay Public API doc. */
export function serdiPayTelecomCode(operator: MobileMoneyOperator | string): string {
  switch (operator) {
    case 'ORANGE_MONEY':
    case 'OM':
      return 'OM';
    case 'MPESA':
    case 'MP':
      return 'MP';
    case 'AIRTEL_MONEY':
    case 'AM':
      return 'AM';
    case 'AFRIMONEY':
    case 'AF':
      return 'AF';
    default:
      return String(operator);
  }
}

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

/** User-facing French when SerdiPay get-token rejects (often merchant not fully active). */
export function mapSerdiPayTokenFailure(status: number, raw?: string): string {
  const msg = (raw ?? '').trim();
  const lower = msg.toLowerCase();
  if (
    lower.includes('failed to get the token') ||
    lower.includes('something went wrong') ||
    status === 400 ||
    status === 401 ||
    status === 403
  ) {
    return (
      'Authentification marchand SerdiPay refusée. ' +
      'Recharge / paiement Mobile Money temporairement indisponible — contactez le support SENGA.'
    );
  }
  if (msg && msg.length <= 160 && !/^https?:\/\//i.test(msg)) return msg;
  return `Échec auth SerdiPay (${status || 'réseau'}). Réessayez plus tard.`;
}

/** Merchant get-token → Bearer access_token. */
export async function serdiPayGetAccessToken(
  get: EnvGetter,
): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  if (!isSerdiPayAuthConfigured(get)) {
    return {
      ok: false,
      message:
        `SerdiPay non configuré. Définissez ${SERDIPAY_ENV_KEYS.email} / ${SERDIPAY_ENV_KEYS.password} ` +
        `(ou alias ${SERDIPAY_ENV_KEYS.clientId} / ${SERDIPAY_ENV_KEYS.clientSecret}).`,
    };
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 30_000) {
    return { ok: true, token: cachedToken.accessToken };
  }

  const email = serdiPayEmail(get)!;
  const password = serdiPayPassword(get)!;
  const tokenUrl = `${baseUrl(get)}${pathOr(get, 'tokenPath', '/api/public-api/v1/merchant/get-token')}`;

  try {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      token?: string;
      expires_in?: number;
      error?: string;
      message?: string;
    };
    const token = data.access_token ?? data.token;
    if (!res.ok || !token) {
      return {
        ok: false,
        message: mapSerdiPayTokenFailure(res.status, data.message ?? data.error),
      };
    }
    // Doc does not specify TTL; refresh proactively after 50 minutes.
    const ttlSec = typeof data.expires_in === 'number' ? data.expires_in : 3000;
    cachedToken = { accessToken: String(token), expiresAtMs: now + ttlSec * 1000 };
    return { ok: true, token: String(token) };
  } catch {
    return { ok: false, message: 'Service SerdiPay temporairement indisponible (auth).' };
  }
}

/** @internal test helper */
export function __resetSerdiPayTokenCache(): void {
  cachedToken = null;
}

export type SerdiPaySmsResult = { success: boolean; message?: string };

/**
 * Envoi SMS — SerdiPay SMS API (sms-api.pdf).
 * POST {base}/api/sms-api/v1/send with { apiId, apiKey, phone, senderId?, text }.
 * Does not use payment get-token / Bearer auth.
 */
export async function serdiPaySendSms(
  get: EnvGetter,
  params: { to: string; message: string },
): Promise<SerdiPaySmsResult> {
  if (!isSerdiPaySmsConfigured(get)) {
    return {
      success: false,
      message: SMS_UNAVAILABLE_USER_MESSAGE,
    };
  }

  const apiId = firstEnv(get, SERDIPAY_ENV_KEYS.smsApiId)!;
  const apiKey = firstEnv(get, SERDIPAY_ENV_KEYS.smsApiKey)!;
  const senderId = firstEnv(get, SERDIPAY_ENV_KEYS.smsSenderId, 'SERDIPAY_SMS_SENDER');
  const url = `${smsBaseUrl(get)}${pathOr(get, 'smsPath', '/api/sms-api/v1/send')}`;
  const phone = serdiPayNormalizeSmsPhone(params.to);
  const text = serdiPaySanitizeSmsText(params.message);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiId,
        apiKey,
        phone,
        text,
        ...(senderId ? { senderId } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      status?: string | number;
      message?: string;
      error?: string;
      data?: unknown;
    };

    // Doc HTTP: 200 sent; 400 API ID; 403 not enough SMS; 404 bad request; 406 Not Acceptable
    if (res.status === 403) {
      return {
        success: false,
        message: data.message ?? data.error ?? 'Crédit SMS SerdiPay insuffisant (403).',
      };
    }
    if (!res.ok || data.success === false) {
      const detail = data.message ?? data.error ?? 'échec fournisseur';
      return {
        success: false,
        message: `Échec SMS SerdiPay (${res.status}): ${detail}`.slice(0, 180),
      };
    }
    return { success: true, message: data.message ?? 'SMS envoyé via SerdiPay' };
  } catch {
    return { success: false, message: 'Service SMS SerdiPay temporairement indisponible.' };
  }
}

export type SerdiPayMmResult = {
  success: boolean;
  transactionId: string;
  providerRef: string;
  message?: string;
};

function paymentCredentials(get: EnvGetter):
  | { ok: true; apiId: string; apiPassword: string; merchantCode: string; merchantPin: string }
  | { ok: false; message: string } {
  if (!isSerdiPayPaymentConfigured(get)) {
    return {
      ok: false,
      message:
        'SerdiPay paiement non configuré. Définissez SERDIPAY_EMAIL, SERDIPAY_PASSWORD, ' +
        'SERDIPAY_API_ID, SERDIPAY_MERCHANT_CODE, SERDIPAY_MERCHANT_PIN ' +
        '(SERDIPAY_API_PASSWORD optionnel : défaut = SERDIPAY_PASSWORD).',
    };
  }
  return {
    ok: true,
    apiId: firstEnv(get, SERDIPAY_ENV_KEYS.apiId)!,
    apiPassword: serdiPayApiPassword(get)!,
    merchantCode: serdiPayMerchantCode(get)!,
    merchantPin: firstEnv(get, SERDIPAY_ENV_KEYS.merchantPin)!,
  };
}

async function postMerchantPayment(
  get: EnvGetter,
  pathKey: 'c2bPath' | 'b2cPath',
  defaultPath: string,
  params: { operator: MobileMoneyOperator; amountCdf: number; phone: string; reference: string },
  kind: 'c2b' | 'b2c',
): Promise<SerdiPayMmResult> {
  const creds = paymentCredentials(get);
  if (creds.ok === false) {
    return { success: false, transactionId: '', providerRef: '', message: creds.message };
  }

  const auth = await serdiPayGetAccessToken(get);
  if (auth.ok === false) {
    return { success: false, transactionId: '', providerRef: '', message: auth.message };
  }

  const url = `${baseUrl(get)}${pathOr(get, pathKey, defaultPath)}`;
  const amount = Math.round(params.amountCdf);
  const clientPhone = serdiPayNormalizePhone(params.phone);
  const telecom = serdiPayTelecomCode(params.operator);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_id: creds.apiId,
        api_password: creds.apiPassword,
        merchantCode: creds.merchantCode,
        merchant_pin: creds.merchantPin,
        clientPhone,
        amount,
        currency: 'CDF',
        telecom,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      status?: string | number;
      message?: string;
      error?: string;
      description?: string;
      transactionId?: string;
      id?: string;
      payment?: {
        status?: string;
        sessionId?: string | number;
        transactionId?: string;
      };
    };

    // 102 = in process (callback later); 200 = completed
    const accepted = res.status === 102 || res.status === 200 || (res.ok && data.success !== false);
    const failedStatus =
      res.status === 400 ||
      res.status === 401 ||
      res.status === 402 ||
      res.status === 403 ||
      res.status === 409 ||
      res.status === 429 ||
      data.success === false ||
      data.status === 'Failed' ||
      data.payment?.status === 'failed';

    if (!accepted || failedStatus) {
      return {
        success: false,
        transactionId: '',
        providerRef: '',
        message:
          data.message ??
          data.error ??
          data.description ??
          `Échec paiement SerdiPay (${res.status})`,
      };
    }

    const txId =
      data.payment?.transactionId ??
      data.transactionId ??
      data.id ??
      (typeof data.payment?.sessionId !== 'undefined' ? String(data.payment.sessionId) : undefined) ??
      params.reference;
    const prefix = kind === 'b2c' ? 'sp_payout_' : 'sp_';
    const providerRef = String(txId).startsWith('sp_') ? String(txId) : `${prefix}${txId}`;

    return {
      success: true,
      transactionId: String(txId),
      providerRef,
      message:
        data.message ??
        data.description ??
        (res.status === 102
          ? 'Transaction SerdiPay en cours (callback)'
          : kind === 'b2c'
            ? 'Retrait SerdiPay initié'
            : 'Demande de paiement SerdiPay envoyée'),
    };
  } catch {
    return {
      success: false,
      transactionId: '',
      providerRef: '',
      message:
        kind === 'b2c'
          ? 'Service retrait SerdiPay temporairement indisponible.'
          : 'Service Mobile Money SerdiPay temporairement indisponible.',
    };
  }
}

/** C2B — encaissement (Word: payment-merchant) : push USSD vers le téléphone client. */
export async function serdiPayInitiateMobileMoney(
  get: EnvGetter,
  params: { operator: MobileMoneyOperator; amountCdf: number; phone: string; reference: string },
): Promise<SerdiPayMmResult> {
  return postMerchantPayment(
    get,
    'c2bPath',
    '/api/public-api/v1/merchant/payment-merchant',
    params,
    'c2b',
  );
}

/** B2C — décaissement (Word: payment-client). */
export async function serdiPayDisburseMobileMoney(
  get: EnvGetter,
  params: { operator: MobileMoneyOperator; amountCdf: number; phone: string; reference: string },
): Promise<SerdiPayMmResult> {
  return postMerchantPayment(
    get,
    'b2cPath',
    '/api/public-api/v1/merchant/payment-client',
    params,
    'b2c',
  );
}
