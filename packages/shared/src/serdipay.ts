/** SerdiPay Public API — Mobile Money RDC (passerelle primaire SENGA).
 *
 * Doc marchand « API USSD - documentation » (Public API) :
 * - Auth : POST /api/public-api/v1/merchant/get-token  { email, password }
 * - Paiement : POST …/payment-client | …/payment-merchant
 *   body : api_id, api_password, merchantCode, merchant_pin, clientPhone,
 *          amount, currency, telecom (AM|OM|MP|AF)
 * - Callback : { status, message, payment: { status, sessionId, transactionId } }
 *
 * SMS OTP : non documenté dans ce PDF — activer seulement si SERDIPAY_SMS_PATH
 * est fourni par SerdiPay (sinon Africa's Talking / Twilio / ALLOW_TEST_OTP).
 */

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
  apiPassword: 'SERDIPAY_API_PASSWORD',
  merchantCode: 'SERDIPAY_MERCHANT_CODE',
  /** Alias for merchantCode */
  merchantId: 'SERDIPAY_MERCHANT_ID',
  merchantPin: 'SERDIPAY_MERCHANT_PIN',
  webhookSecret: 'SERDIPAY_WEBHOOK_SECRET',
  tokenPath: 'SERDIPAY_TOKEN_PATH',
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
      firstEnv(get, SERDIPAY_ENV_KEYS.apiPassword) &&
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

/** SMS only if SerdiPay shared an SMS path (not in Public API payment PDF). */
export function isSerdiPaySmsConfigured(get: EnvGetter): boolean {
  return Boolean(isSerdiPayAuthConfigured(get) && get(SERDIPAY_ENV_KEYS.smsPath)?.trim());
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

function baseUrl(get: EnvGetter): string {
  return (get(SERDIPAY_ENV_KEYS.baseUrl)?.trim() || 'https://serdipay.com').replace(/\/$/, '');
}

function pathOr(get: EnvGetter, key: keyof typeof SERDIPAY_ENV_KEYS, fallback: string): string {
  const raw = get(SERDIPAY_ENV_KEYS[key])?.trim();
  if (!raw) return fallback;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/** Doc uses 243… without leading +. */
export function serdiPayNormalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('243')) return digits;
  if (digits.startsWith('0') && digits.length >= 9) return `243${digits.slice(1)}`;
  return digits;
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
        message: data.message ?? data.error ?? `Échec auth SerdiPay (${res.status})`,
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
 * Envoi SMS OTP — uniquement si SERDIPAY_SMS_PATH est défini
 * (chemin non présent dans la doc Public API paiement reçue).
 */
export async function serdiPaySendSms(
  get: EnvGetter,
  params: { to: string; message: string },
): Promise<SerdiPaySmsResult> {
  const smsPath = get(SERDIPAY_ENV_KEYS.smsPath)?.trim();
  if (!smsPath) {
    return {
      success: false,
      message:
        'SMS SerdiPay non activé : la doc Public API reçue ne couvre que les paiements. ' +
        'Attendez le chemin SMS de SerdiPay (SERDIPAY_SMS_PATH) ou configurez Africa\'s Talking / Twilio.',
    };
  }

  const auth = await serdiPayGetAccessToken(get);
  if (auth.ok === false) return { success: false, message: auth.message };

  const url = `${baseUrl(get)}${smsPath.startsWith('/') ? smsPath : `/${smsPath}`}`;
  const merchantCode = serdiPayMerchantCode(get);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: serdiPayNormalizePhone(params.to),
        phone: serdiPayNormalizePhone(params.to),
        clientPhone: serdiPayNormalizePhone(params.to),
        message: params.message,
        ...(merchantCode ? { merchantCode } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      status?: string | number;
      message?: string;
      error?: string;
    };
    if (!res.ok || data.success === false || data.status === 'Failed') {
      return {
        success: false,
        message: data.message ?? data.error ?? `Échec SMS SerdiPay (${res.status})`,
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
        'SERDIPAY_API_ID, SERDIPAY_API_PASSWORD, SERDIPAY_MERCHANT_CODE, SERDIPAY_MERCHANT_PIN.',
    };
  }
  return {
    ok: true,
    apiId: firstEnv(get, SERDIPAY_ENV_KEYS.apiId)!,
    apiPassword: firstEnv(get, SERDIPAY_ENV_KEYS.apiPassword)!,
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
        // Extra correlation fields (confirm with SerdiPay if accepted)
        reference: params.reference,
        externalId: params.reference,
        merchantReference: params.reference,
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

/** C2B — encaissement (payment-client) : push USSD vers le téléphone client. */
export async function serdiPayInitiateMobileMoney(
  get: EnvGetter,
  params: { operator: MobileMoneyOperator; amountCdf: number; phone: string; reference: string },
): Promise<SerdiPayMmResult> {
  return postMerchantPayment(
    get,
    'c2bPath',
    '/api/public-api/v1/merchant/payment-client',
    params,
    'c2b',
  );
}

/** B2C — décaissement (payment-merchant) — confirmer le sens avec SerdiPay si besoin. */
export async function serdiPayDisburseMobileMoney(
  get: EnvGetter,
  params: { operator: MobileMoneyOperator; amountCdf: number; phone: string; reference: string },
): Promise<SerdiPayMmResult> {
  return postMerchantPayment(
    get,
    'b2cPath',
    '/api/public-api/v1/merchant/payment-merchant',
    params,
    'b2c',
  );
}
