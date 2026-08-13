/** Production security helpers — refuse weak defaults when NODE_ENV=production. */

import {
  isAfricasTalkingConfigured,
  isTwilioSmsConfigured,
} from './africas-talking';
import { isSerdiPaySmsConfigured } from './serdipay';

const DEV_JWT = 'dev_secret';
const DEV_INTERNAL = 'mova-internal-dev';

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** JWT secret: weak/missing values are rejected in production. */
export function resolveJwtSecret(explicit?: string | null): string {
  const secret = (explicit ?? process.env.JWT_SECRET ?? '').trim();
  if (isProductionRuntime()) {
    if (!secret || secret === DEV_JWT || secret.length < 32) {
      throw new Error(
        'JWT_SECRET must be set to a strong value (≥ 32 characters) in production. Refusing to start.',
      );
    }
    return secret;
  }
  return secret || DEV_JWT;
}

/** Internal API key: default `mova-internal-dev` is rejected in production. */
export function resolveInternalApiKey(explicit?: string | null): string {
  const key = (explicit ?? process.env.INTERNAL_API_KEY ?? '').trim();
  if (isProductionRuntime()) {
    if (!key || key === DEV_INTERNAL || key.length < 24) {
      throw new Error(
        'INTERNAL_API_KEY must be set to a strong value (≥ 24 characters) in production. Refusing to start.',
      );
    }
    return key;
  }
  return key || DEV_INTERNAL;
}

const ONRENDER_ORIGIN_RE = /^https:\/\/[\w-]+\.onrender\.com$/i;

/**
 * CORS origins for Nest `enableCors`.
 * - Dev: reflect request origin (`true`) when unset
 * - Prod: require `CORS_ORIGIN` (comma-separated); otherwise deny browser CORS
 * - Entries `https://*.onrender.com` / `*.onrender.com` allow any `*.onrender.com` https origin
 */
export function resolveCorsOrigin(): boolean | string | RegExp | Array<string | RegExp> {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (raw) {
    const tokens = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (tokens.length === 0) return false;
    const origins: Array<string | RegExp> = [];
    let allowOnrender = false;
    for (const token of tokens) {
      if (token === '*.onrender.com' || token === 'https://*.onrender.com') {
        allowOnrender = true;
        continue;
      }
      origins.push(token);
    }
    if (allowOnrender) origins.push(ONRENDER_ORIGIN_RE);
    if (origins.length === 0) return false;
    return origins.length === 1 ? origins[0] : origins;
  }
  if (isProductionRuntime()) {
    // eslint-disable-next-line no-console
    console.warn(
      '[SENGA] CORS_ORIGIN unset in production — cross-origin browser requests are denied. Set CORS_ORIGIN to your web/admin/partner origins.',
    );
    return false;
  }
  return true;
}

/** Fixed OTP used in local MOCK_OTP and production ALLOW_TEST_OTP (seed phones only). */
export const TEST_OTP_CODE = '123456';

/**
 * Seed / demo phones allowed for ALLOW_TEST_OTP (Play Internal without SerdiPay).
 * Override with comma-separated TEST_OTP_PHONES if needed.
 */
export const DEFAULT_TEST_OTP_PHONES: readonly string[] = [
  '+243900000001',
  '+243900000002',
  '+243900000003',
  '+243900000004',
  '+243900000005',
  // Passengers (15): 010–019 + 040–044
  '+243900000010',
  '+243900000011',
  '+243900000012',
  '+243900000013',
  '+243900000014',
  '+243900000015',
  '+243900000016',
  '+243900000017',
  '+243900000018',
  '+243900000019',
  '+243900000040',
  '+243900000041',
  '+243900000042',
  '+243900000043',
  '+243900000044',
  // Drivers (15): 020–029 + 050–054
  '+243900000020',
  '+243900000021',
  '+243900000022',
  '+243900000023',
  '+243900000024',
  '+243900000025',
  '+243900000026',
  '+243900000027',
  '+243900000028',
  '+243900000029',
  '+243900000050',
  '+243900000051',
  '+243900000052',
  '+243900000053',
  '+243900000054',
  // Partners
  '+243900000030',
  '+243900000031',
];

/** True when MOCK_OTP=true outside production (local/dev only). */
export function isMockOtpAllowed(): boolean {
  return !isProductionRuntime() && process.env.MOCK_OTP === 'true';
}

/** Production Play/staging: ALLOW_TEST_OTP=true enables fixed OTP for whitelisted seed phones only. */
export function isTestOtpModeEnabled(): boolean {
  return process.env.ALLOW_TEST_OTP === 'true';
}

export function getTestOtpPhones(): Set<string> {
  const raw = process.env.TEST_OTP_PHONES?.trim();
  const list = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_TEST_OTP_PHONES];
  return new Set(list);
}

/** Fixed OTP 123456 for a phone when mock (dev) or ALLOW_TEST_OTP whitelist (prod Play). */
export function isTestOtpAllowedForPhone(phone: string): boolean {
  if (isMockOtpAllowed()) return true;
  if (!isTestOtpModeEnabled()) return false;
  return getTestOtpPhones().has(phone);
}

function envGet(key: string): string | undefined {
  return process.env[key];
}

/** Real SMS provider matching SMS_PROVIDER (or any if unset) is configured. */
export function isProductionSmsConfigured(): boolean {
  const preferred = (process.env.SMS_PROVIDER ?? '').trim().toLowerCase();
  if (preferred === 'serdipay') return isSerdiPaySmsConfigured(envGet);
  if (preferred === 'africastalking') return isAfricasTalkingConfigured(envGet);
  if (preferred === 'twilio') return isTwilioSmsConfigured(envGet);
  return (
    isSerdiPaySmsConfigured(envGet) ||
    isAfricasTalkingConfigured(envGet) ||
    isTwilioSmsConfigured(envGet)
  );
}

/** Fail fast on weak secrets / mock flags before Nest listens. */
export function assertProductionSecurity(serviceName = 'service'): void {
  if (!isProductionRuntime()) return;

  resolveJwtSecret();
  resolveInternalApiKey();

  if (process.env.MOCK_OTP === 'true') {
    throw new Error(
      `[${serviceName}] MOCK_OTP=true is forbidden in production. Use ALLOW_TEST_OTP=true (seed phones + code 123456) for Play testing, or configure SerdiPay.`,
    );
  }
  if (process.env.MOCK_SMS === 'true') {
    throw new Error(
      `[${serviceName}] MOCK_SMS=true is forbidden in production. Configure SerdiPay (ou Africa's Talking / Twilio).`,
    );
  }
  if (process.env.MOCK_PAYMENTS === 'true') {
    // eslint-disable-next-line no-console
    console.warn(
      `[${serviceName}] MOCK_PAYMENTS=true in production — mobile-money providers will not charge real users.`,
    );
  }
  if (isTestOtpModeEnabled()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[${serviceName}] ALLOW_TEST_OTP=true: OTP de test (123456) limité aux numéros seed. Retirer dès que SerdiPay SMS (SERDIPAY_SMS_API_ID/KEY) ou AT/Twilio fonctionne.`,
    );
  }

  // Only auth-service sends OTP; other services warn if SMS env is missing.
  if (!isProductionSmsConfigured() && !isTestOtpModeEnabled()) {
    const msg =
      `[${serviceName}] No SMS provider configured (SERDIPAY_SMS_API_ID/KEY, AFRICAS_TALKING_* or TWILIO_* for SMS_PROVIDER). OTP delivery will fail.`;
    if (serviceName === 'auth-service') {
      throw new Error(
        `${msg} Refusing to start. Keep ALLOW_TEST_OTP=true until SerdiPay SMS (or AT/Twilio) is live.`,
      );
    }
    // eslint-disable-next-line no-console
    console.warn(msg);
  }
}
