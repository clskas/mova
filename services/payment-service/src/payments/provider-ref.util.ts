/** Prefixes we store on initiate (SerdiPay C2B `sp_`, B2C `sp_payout_`, CinetPay `cp_`, AT `at_`). */
const PROVIDER_REF_PREFIXES = ['sp_payout_', 'sp_', 'cp_', 'at_'] as const;

/**
 * Lookup keys so a callback `SD260829CPHOG` matches stored `sp_SD260829CPHOG` (and the reverse).
 */
export function expandProviderRefKeys(ref: string): string[] {
  const raw = ref.trim();
  if (!raw) return [];
  const keys = new Set<string>([raw]);
  const lower = raw.toLowerCase();
  const matched = PROVIDER_REF_PREFIXES.find((prefix) => lower.startsWith(prefix));
  if (matched) {
    const stripped = raw.slice(matched.length);
    if (stripped) keys.add(stripped);
  } else {
    for (const prefix of PROVIDER_REF_PREFIXES) {
      keys.add(`${prefix}${raw}`);
    }
  }
  return [...keys];
}

export function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function nestedPayment(payload: Record<string, unknown>): Record<string, unknown> {
  return asRecord(payload.data ?? payload.payload ?? payload.result ?? payload.payment ?? {});
}

const TX_ID_KEYS = [
  'transactionId',
  'transaction_id',
  'providerRef',
  'provider_ref',
  'externalId',
  'external_id',
  'txnId',
];

const FALLBACK_REF_KEYS = ['reference', 'merchantReference', 'clientReference', 'sessionId', 'id'];

/**
 * SerdiPay Public API callback: top-level and/or `{ payment: { transactionId, sessionId, … } }`.
 * Prefer `transactionId` (no `sp_` prefix from SerdiPay) over sessionId.
 */
export function extractAggregatorProviderRef(payload: Record<string, unknown>): string | undefined {
  const nested = nestedPayment(payload);
  return (
    pickString(nested, TX_ID_KEYS) ??
    pickString(payload, TX_ID_KEYS) ??
    pickString(nested, FALLBACK_REF_KEYS) ??
    pickString(payload, FALLBACK_REF_KEYS)
  );
}

export function normalizeOutcome(raw?: string): 'COMPLETED' | 'FAILED' | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'COMPLETE', 'PAID', 'OK', 'TS-SUCCESS'].includes(s)) {
    return 'COMPLETED';
  }
  if (['FAILED', 'FAIL', 'ERROR', 'CANCELLED', 'CANCELED', 'REJECTED', 'TIMEOUT', 'TS-FAILED'].includes(s)) {
    return 'FAILED';
  }
  return null;
}

function sessionStatusNumber(payload: Record<string, unknown>, nested: Record<string, unknown>): number | null {
  const raw = nested.sessionStatus ?? payload.sessionStatus ?? nested.session_status ?? payload.session_status;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

/**
 * SerdiPay: nested `payment.status` ("success"), outer HTTP-like `status` (200),
 * and `sessionStatus: 3` (final success per their live callback).
 */
export function extractAggregatorOutcome(payload: Record<string, unknown>): 'COMPLETED' | 'FAILED' | null {
  const nested = nestedPayment(payload);
  const sessionN = sessionStatusNumber(payload, nested);

  const topStatus = payload.status;
  if (typeof topStatus === 'number') {
    if (topStatus === 200) return 'COMPLETED';
    if (topStatus === 102) return sessionN === 3 ? 'COMPLETED' : null;
    if ([400, 401, 402, 403, 409, 429].includes(topStatus)) return 'FAILED';
  }

  const fromText =
    normalizeOutcome(pickString(payload, ['status', 'transactionStatus', 'paymentStatus', 'state', 'resultCode'])) ??
    normalizeOutcome(pickString(nested, ['status', 'transactionStatus', 'paymentStatus', 'state', 'resultCode']));
  if (fromText) return fromText;

  if (sessionN === 3) return 'COMPLETED';
  return null;
}
