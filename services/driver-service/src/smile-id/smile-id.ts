/**
 * Smile ID (identity checks by a specialised provider): document authenticity + live selfie
 * compared with the photo on the document. Pure helpers, kept apart from the Nest service so
 * they can be tested without network access.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export type SmileIdEnv = 'sandbox' | 'production';

export interface SmileIdConfig {
  partnerId: string;
  apiKey: string;
  env: SmileIdEnv;
  callbackUrl: string;
  privacyPolicyUrl: string;
  redirectUrl?: string;
}

const DEFAULT_CALLBACK_URL = 'https://api.afri-soft.com/api/drivers/smile-id/webhook';
const DEFAULT_PRIVACY_URL = 'https://senga.afri-soft.com/privacy';

/** Reads the Smile ID settings; null while the partner ID or the API key is missing. */
export function smileIdConfig(env: NodeJS.ProcessEnv = process.env): SmileIdConfig | null {
  const partnerId = (env.SMILE_ID_PARTNER_ID ?? '').trim();
  const apiKey = (env.SMILE_ID_API_KEY ?? '').trim();
  if (!partnerId || !apiKey) return null;
  return {
    partnerId,
    apiKey,
    env: (env.SMILE_ID_ENV ?? '').trim().toLowerCase() === 'production' ? 'production' : 'sandbox',
    callbackUrl: (env.SMILE_ID_CALLBACK_URL ?? '').trim() || DEFAULT_CALLBACK_URL,
    privacyPolicyUrl: (env.SMILE_ID_PRIVACY_URL ?? '').trim() || DEFAULT_PRIVACY_URL,
    redirectUrl: (env.SMILE_ID_REDIRECT_URL ?? '').trim() || undefined,
  };
}

export function smileIdBaseUrl(env: SmileIdEnv): string {
  return env === 'production' ? 'https://api.smileidentity.com' : 'https://testapi.smileidentity.com';
}

/** DRC documents accepted on the verification link (codes from Smile ID's supported-documents list). */
export const SMILE_ID_DRC_DOCUMENTS = ['VOTER_ID', 'PASSPORT', 'DRIVERS_LICENSE'] as const;

export function smileIdLinkIdTypes() {
  return SMILE_ID_DRC_DOCUMENTS.map((id_type) => ({
    country: 'CD',
    id_type,
    verification_method: 'document_verification',
  }));
}

/** Smile ID signs each webhook: base64(HMAC-SHA256(apiKey, timestamp + partnerId + "sid_request")). */
export function smileIdSignature(apiKey: string, timestamp: string, partnerId: string): string {
  return createHmac('sha256', apiKey).update(`${timestamp}${partnerId}sid_request`).digest('base64');
}

export function verifySmileIdSignature(
  config: Pick<SmileIdConfig, 'apiKey' | 'partnerId'>,
  timestamp: string | undefined,
  signature: string | undefined,
): boolean {
  if (!timestamp || !signature) return false;
  const expected = Buffer.from(smileIdSignature(config.apiKey, timestamp, config.partnerId));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type SmileIdStatus = 'PENDING' | 'clear' | 'attention' | 'block' | 'error' | 'processing';

const FINAL_STATUSES = new Set(['clear', 'attention', 'block', 'error']);

export function isFinalSmileIdStatus(status: string | null | undefined): boolean {
  return FINAL_STATUSES.has(String(status ?? ''));
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Keeps only what the admin needs from a webhook (no device signals, no IP or location):
 * verdict, identity read from the document, fraud summary, receipt.
 */
export function summarizeSmileIdResult(payload: Record<string, unknown>) {
  const idFields = (payload.id_fields ?? {}) as Record<string, unknown>;
  const antifraud = (payload.antifraud ?? {}) as Record<string, unknown>;
  const fraudRisk = (antifraud.fraud_risk ?? {}) as Record<string, unknown>;
  const smileSecure = (antifraud.smile_secure ?? {}) as Record<string, unknown>;
  const summary = (antifraud.summary ?? {}) as Record<string, unknown>;
  return {
    status: str(payload.status),
    message: str(payload.message),
    reason: str(payload.reason),
    product: str(payload.product),
    completedAt: str(payload.completed_at),
    receiptUrl: str(payload.kyc_receipt),
    idFields: {
      fullName: str(idFields.full_name),
      idNumber: str(idFields.id_number),
      idType: str(idFields.id_type),
      dateOfBirth: str(idFields.date_of_birth),
      expirationDate: str(idFields.expiration_date),
    },
    fraud: {
      detected: summary.fraud_detected === true,
      sources: Array.isArray(summary.fraud_sources) ? summary.fraud_sources.filter((s) => typeof s === 'string') : [],
      riskLevel: str(fraudRisk.risk_level),
      riskIndicators: Array.isArray(fraudRisk.risk_indicators)
        ? fraudRisk.risk_indicators.filter((s) => typeof s === 'string')
        : [],
      duplicateUsers: str(smileSecure.status) === 'clear' ? null : str(smileSecure.message),
    },
  };
}

/** The Smile ID user and job ids of a webhook: headers first, then partner_params. */
export function smileIdWebhookIds(headers: Record<string, unknown>, payload: Record<string, unknown>) {
  const header = (name: string) => {
    const v = headers[name];
    return str(Array.isArray(v) ? v[0] : v);
  };
  const params = (payload.partner_params ?? {}) as Record<string, unknown>;
  return {
    smileUserId: header('user-id') ?? str(params.user_id) ?? str(payload.user_id),
    jobId: header('smileid-job-id') ?? str(params.job_id) ?? str(payload.job_id),
    sengaUserId: str(params.senga_user_id),
  };
}
