/**
 * AfriSoft SMS / OTP Hub client (HMAC).
 * Contract: docs/AFRISOFT_SMS_OTP_HUB_API.md
 *
 * SENGA `mova-auth` calls this over HTTPS. SerdiPay / Africa's Talking secrets
 * stay on the VPS only (`/opt/afrisoft-sms/.env`) — never on Render.
 *
 * Env (client):
 *   AFRISOFT_SMS_HUB_URL | SMS_HUB_URL = https://sms.afri-soft.com
 *   AFRISOFT_HUB_APP_ID (default senga)
 *   AFRISOFT_HUB_API_KEY | AFRISOFT_PAY_HUB_API_KEY  (same HMAC key as pay hub)
 */

import {
  afrisoftHubApiKey,
  afrisoftHubAppId,
  afrisoftHubReference,
  afrisoftHubSign,
} from './afrisoft-pay-hub';
import type { EnvGetter } from './africas-talking';
import { serdiPayNormalizePhone, SMS_UNAVAILABLE_USER_MESSAGE } from './serdipay';

const DEFAULT_SMS_HUB_URL = 'https://sms.afri-soft.com';

function firstEnv(get: EnvGetter, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = get(key)?.trim();
    if (v) return v;
  }
  return undefined;
}

export function afrisoftSmsHubBaseUrl(get: EnvGetter): string {
  return (firstEnv(get, 'AFRISOFT_SMS_HUB_URL', 'SMS_HUB_URL') || DEFAULT_SMS_HUB_URL).replace(
    /\/$/,
    '',
  );
}

/** True when SENGA/app should send SMS/OTP via sms.afri-soft.com (not SerdiPay directly). */
export function isAfrisoftSmsHubClientConfigured(get: EnvGetter): boolean {
  const url = firstEnv(get, 'AFRISOFT_SMS_HUB_URL', 'SMS_HUB_URL');
  const apiKey = afrisoftHubApiKey(get);
  return Boolean(url && apiKey);
}

export type AfriSoftSmsHubResult = {
  success: boolean;
  message?: string;
  smsId?: string;
  otpId?: string;
  reference?: string;
  provider?: string;
  status?: string;
};

async function smsHubFetch(
  get: EnvGetter,
  path: string,
  bodyObj: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const apiKey = afrisoftHubApiKey(get);
  const appId = afrisoftHubAppId(get);
  const url = firstEnv(get, 'AFRISOFT_SMS_HUB_URL', 'SMS_HUB_URL');
  if (!apiKey || !url) {
    return {
      ok: false,
      status: 0,
      json: {
        message:
          'Hub SMS AfriSoft non configuré (AFRISOFT_SMS_HUB_URL, AFRISOFT_HUB_APP_ID, AFRISOFT_HUB_API_KEY).',
      },
    };
  }
  const rawBody = JSON.stringify(bodyObj);
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = afrisoftHubSign(apiKey, ts, 'POST', path, rawBody);
  try {
    const res = await fetch(`${afrisoftSmsHubBaseUrl(get)}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-AfriSoft-App-Id': appId,
        'X-AfriSoft-Api-Key': apiKey,
        'X-AfriSoft-Timestamp': ts,
        'X-AfriSoft-Signature': sig,
      },
      body: rawBody,
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
      json: { message: 'Hub SMS AfriSoft temporairement indisponible.' },
    };
  }
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = (v as Record<string, unknown>).message;
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
    }
  }
  return undefined;
}

/**
 * Transactional SMS — SENGA OTP uses this so `mova-auth` keeps generating/verifying
 * the code (seed 123456 stays local). Hub `/v1/otp/send` would mint a second OTP.
 */
export async function afrisoftSmsHubSendSms(
  get: EnvGetter,
  params: { phone: string; text: string; purpose?: string; reference?: string; idempotencyKey?: string },
): Promise<AfriSoftSmsHubResult> {
  if (!isAfrisoftSmsHubClientConfigured(get)) {
    return {
      success: false,
      message: SMS_UNAVAILABLE_USER_MESSAGE,
    };
  }
  const appId = afrisoftHubAppId(get);
  const purpose = (params.purpose || 'notify').trim().toLowerCase() || 'notify';
  const reference = params.reference || afrisoftHubReference(appId, purpose);
  const body = {
    app_id: appId,
    phone: serdiPayNormalizePhone(params.phone),
    text: params.text,
    reference,
    ...(params.idempotencyKey ? { idempotency_key: params.idempotencyKey } : {}),
  };
  const { ok, json } = await smsHubFetch(get, '/v1/sms/send', body);
  if (!ok) {
    return {
      success: false,
      message: pickStr(json, ['message', 'error']) ?? SMS_UNAVAILABLE_USER_MESSAGE,
    };
  }
  return {
    success: true,
    message: pickStr(json, ['message']) ?? 'SMS envoyé',
    smsId: pickStr(json, ['sms_id', 'smsId']),
    reference: pickStr(json, ['reference']) ?? reference,
    provider: pickStr(json, ['provider']),
    status: pickStr(json, ['status']),
  };
}

/** Multi-app OTP (Educongo / sisters). Hub generates and stores the code. */
export async function afrisoftSmsHubSendOtp(
  get: EnvGetter,
  params: {
    phone: string;
    purpose?: string;
    locale?: string;
    reference?: string;
    idempotencyKey?: string;
  },
): Promise<AfriSoftSmsHubResult> {
  if (!isAfrisoftSmsHubClientConfigured(get)) {
    return {
      success: false,
      message: SMS_UNAVAILABLE_USER_MESSAGE,
    };
  }
  const appId = afrisoftHubAppId(get);
  const purpose = (params.purpose || 'login').trim().toLowerCase() || 'login';
  const reference = params.reference || afrisoftHubReference(appId, purpose);
  const body = {
    app_id: appId,
    phone: serdiPayNormalizePhone(params.phone),
    purpose,
    locale: params.locale || 'fr',
    reference,
    ...(params.idempotencyKey ? { idempotency_key: params.idempotencyKey } : {}),
  };
  const { ok, json } = await smsHubFetch(get, '/v1/otp/send', body);
  if (!ok) {
    return {
      success: false,
      message: pickStr(json, ['message', 'error']) ?? SMS_UNAVAILABLE_USER_MESSAGE,
    };
  }
  return {
    success: true,
    message: pickStr(json, ['message']) ?? 'Code envoyé.',
    otpId: pickStr(json, ['otp_id', 'otpId']),
    reference: pickStr(json, ['reference']) ?? reference,
    provider: pickStr(json, ['provider']),
    status: pickStr(json, ['status']),
  };
}
