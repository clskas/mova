/** SerdiPay — OTP SMS + Mobile Money RDC (passerelle primaire SENGA).
 *
 * Docs marchand : https://apis.serdipay.com/ (OAuth 2.0 / JWT).
 * Les chemins REST exacts sont configurables : confirmez-les dans le portail
 * développeur SerdiPay ou avec info@serdipay.com avant la prod.
 */

export const SERDIPAY_ENV_KEYS = {
  baseUrl: 'SERDIPAY_BASE_URL',
  clientId: 'SERDIPAY_CLIENT_ID',
  clientSecret: 'SERDIPAY_CLIENT_SECRET',
  merchantId: 'SERDIPAY_MERCHANT_ID',
  webhookSecret: 'SERDIPAY_WEBHOOK_SECRET',
  tokenPath: 'SERDIPAY_TOKEN_PATH',
  smsPath: 'SERDIPAY_SMS_PATH',
  c2bPath: 'SERDIPAY_C2B_PATH',
  b2cPath: 'SERDIPAY_B2C_PATH',
  smsProvider: 'SMS_PROVIDER',
  mobileMoneyGateway: 'MOBILE_MONEY_GATEWAY',
} as const;

import type { EnvGetter, MobileMoneyOperator } from './africas-talking';

export function isSerdiPayConfigured(get: EnvGetter): boolean {
  return Boolean(
    get(SERDIPAY_ENV_KEYS.clientId)?.trim() && get(SERDIPAY_ENV_KEYS.clientSecret)?.trim(),
  );
}

export function useSerdiPayMobileMoney(get: EnvGetter): boolean {
  const gateway = (get(SERDIPAY_ENV_KEYS.mobileMoneyGateway) ?? 'serdipay').trim().toLowerCase();
  return gateway === 'serdipay' && isSerdiPayConfigured(get);
}

function baseUrl(get: EnvGetter): string {
  return (get(SERDIPAY_ENV_KEYS.baseUrl)?.trim() || 'https://apis.serdipay.com').replace(/\/$/, '');
}

function pathOr(get: EnvGetter, key: keyof typeof SERDIPAY_ENV_KEYS, fallback: string): string {
  const raw = get(SERDIPAY_ENV_KEYS[key])?.trim();
  if (!raw) return fallback;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

/** OAuth 2.0 client_credentials → Bearer JWT. */
export async function serdiPayGetAccessToken(get: EnvGetter): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  if (!isSerdiPayConfigured(get)) {
    return {
      ok: false,
      message: `SerdiPay non configuré. Définissez ${SERDIPAY_ENV_KEYS.clientId} et ${SERDIPAY_ENV_KEYS.clientSecret}.`,
    };
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 30_000) {
    return { ok: true, token: cachedToken.accessToken };
  }

  const clientId = get(SERDIPAY_ENV_KEYS.clientId)!.trim();
  const clientSecret = get(SERDIPAY_ENV_KEYS.clientSecret)!.trim();
  const tokenUrl = `${baseUrl(get)}${pathOr(get, 'tokenPath', '/oauth/token')}`;

  try {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
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
    const ttlSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    cachedToken = { accessToken: token, expiresAtMs: now + ttlSec * 1000 };
    return { ok: true, token };
  } catch {
    return { ok: false, message: 'Service SerdiPay temporairement indisponible (auth).' };
  }
}

/** @internal test helper */
export function __resetSerdiPayTokenCache(): void {
  cachedToken = null;
}

export type SerdiPaySmsResult = { success: boolean; message?: string };

/** Envoi SMS OTP via API SerdiPay (chemin configurable SERDIPAY_SMS_PATH). */
export async function serdiPaySendSms(
  get: EnvGetter,
  params: { to: string; message: string },
): Promise<SerdiPaySmsResult> {
  const auth = await serdiPayGetAccessToken(get);
  if (auth.ok === false) return { success: false, message: auth.message };

  const url = `${baseUrl(get)}${pathOr(get, 'smsPath', '/api/v1/sms/send')}`;
  const merchantId = get(SERDIPAY_ENV_KEYS.merchantId)?.trim();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: params.to,
        phone: params.to,
        message: params.message,
        ...(merchantId ? { merchantId } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      status?: string;
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

function operatorCode(operator: MobileMoneyOperator): string {
  switch (operator) {
    case 'ORANGE_MONEY':
      return 'ORANGE';
    case 'MPESA':
      return 'MPESA';
    case 'AIRTEL_MONEY':
      return 'AIRTEL';
    default:
      return operator;
  }
}

export type SerdiPayMmResult = {
  success: boolean;
  transactionId: string;
  providerRef: string;
  message?: string;
};

/** C2B — encaissement Mobile Money (checkout / push USSD). */
export async function serdiPayInitiateMobileMoney(
  get: EnvGetter,
  params: { operator: MobileMoneyOperator; amountCdf: number; phone: string; reference: string },
): Promise<SerdiPayMmResult> {
  const auth = await serdiPayGetAccessToken(get);
  if (auth.ok === false) {
    return { success: false, transactionId: '', providerRef: '', message: auth.message };
  }

  const url = `${baseUrl(get)}${pathOr(get, 'c2bPath', '/api/v1/payments/c2b')}`;
  const merchantId = get(SERDIPAY_ENV_KEYS.merchantId)?.trim();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: params.amountCdf,
        currency: 'CDF',
        phone: params.phone,
        phoneNumber: params.phone,
        provider: operatorCode(params.operator),
        operator: operatorCode(params.operator),
        reference: params.reference,
        externalId: params.reference,
        ...(merchantId ? { merchantId } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      status?: string;
      transactionId?: string;
      id?: string;
      message?: string;
      error?: string;
      description?: string;
    };
    if (!res.ok || data.success === false || data.status === 'Failed') {
      return {
        success: false,
        transactionId: '',
        providerRef: '',
        message: data.message ?? data.error ?? data.description ?? `Échec paiement SerdiPay (${res.status})`,
      };
    }
    const txId = data.transactionId ?? data.id ?? params.reference;
    const providerRef = txId.startsWith('sp_') ? txId : `sp_${txId}`;
    return {
      success: true,
      transactionId: txId,
      providerRef,
      message: data.message ?? data.description ?? 'Demande de paiement SerdiPay envoyée',
    };
  } catch {
    return {
      success: false,
      transactionId: '',
      providerRef: '',
      message: 'Service Mobile Money SerdiPay temporairement indisponible.',
    };
  }
}

/** B2C — décaissement / retrait vers Mobile Money. */
export async function serdiPayDisburseMobileMoney(
  get: EnvGetter,
  params: { operator: MobileMoneyOperator; amountCdf: number; phone: string; reference: string },
): Promise<SerdiPayMmResult> {
  const auth = await serdiPayGetAccessToken(get);
  if (auth.ok === false) {
    return { success: false, transactionId: '', providerRef: '', message: auth.message };
  }

  const url = `${baseUrl(get)}${pathOr(get, 'b2cPath', '/api/v1/payments/b2c')}`;
  const merchantId = get(SERDIPAY_ENV_KEYS.merchantId)?.trim();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: params.amountCdf,
        currency: 'CDF',
        phone: params.phone,
        phoneNumber: params.phone,
        provider: operatorCode(params.operator),
        operator: operatorCode(params.operator),
        reference: params.reference,
        externalId: params.reference,
        type: 'payout',
        ...(merchantId ? { merchantId } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      status?: string;
      transactionId?: string;
      id?: string;
      message?: string;
      error?: string;
      description?: string;
    };
    if (!res.ok || data.success === false || data.status === 'Failed') {
      return {
        success: false,
        transactionId: '',
        providerRef: '',
        message: data.message ?? data.error ?? data.description ?? `Échec retrait SerdiPay (${res.status})`,
      };
    }
    const txId = data.transactionId ?? data.id ?? `payout_${params.reference}`;
    const providerRef = txId.startsWith('sp_') ? txId : `sp_payout_${txId}`;
    return {
      success: true,
      transactionId: txId,
      providerRef,
      message: data.message ?? data.description ?? 'Retrait SerdiPay initié',
    };
  } catch {
    return {
      success: false,
      transactionId: '',
      providerRef: '',
      message: 'Service retrait SerdiPay temporairement indisponible.',
    };
  }
}
