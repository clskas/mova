/** Production security helpers — refuse weak defaults when NODE_ENV=production. */

import {
  isAfricasTalkingConfigured,
  isTwilioSmsConfigured,
} from './africas-talking';
import { isSerdiPayConfigured } from './serdipay';

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

/**
 * CORS origins for Nest `enableCors`.
 * - Dev: reflect request origin (`true`) when unset
 * - Prod: require `CORS_ORIGIN` (comma-separated); otherwise deny browser CORS
 */
export function resolveCorsOrigin(): boolean | string | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (raw) {
    const origins = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
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

/** True only when both NODE_ENV≠production and MOCK_OTP=true (safe for mockCode responses). */
export function isMockOtpAllowed(): boolean {
  return !isProductionRuntime() && process.env.MOCK_OTP === 'true';
}

function envGet(key: string): string | undefined {
  return process.env[key];
}

/** Real SMS provider (SerdiPay, Africa's Talking or Twilio) is configured. */
export function isProductionSmsConfigured(): boolean {
  return (
    isSerdiPayConfigured(envGet) ||
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
      `[${serviceName}] MOCK_OTP=true is forbidden in production. Set MOCK_OTP=false and configure a real SMS provider.`,
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

  // Only auth-service sends OTP; other services warn if SMS env is missing.
  if (!isProductionSmsConfigured()) {
    const msg = `[${serviceName}] No SMS provider configured (SERDIPAY_* , AFRICAS_TALKING_* or TWILIO_*). OTP delivery will fail.`;
    if (serviceName === 'auth-service') {
      throw new Error(`${msg} Refusing to start.`);
    }
    // eslint-disable-next-line no-console
    console.warn(msg);
  }
}
