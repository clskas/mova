import { INTERNAL_API_KEY, MovaErrorCode, MovaHttpException, serviceUrl } from '@mova/shared';

export type EscrowAction = 'RELEASE' | 'REFUND' | 'PARTIAL' | 'FREEZE' | 'RECORD' | 'CREDIT_RESTAURANT';

async function escrowRequest(path: string, method: string, body?: object) {
  const res = await fetch(serviceUrl('payment', path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-internal-api-key': INTERNAL_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
    throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, undefined, err.message ?? 'Échec séquestre');
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function recordWalletEscrow(params: {
  referenceType: string;
  referenceId: string;
  userId: string;
  amountCdf: number;
}) {
  return escrowRequest(
    `/internal/services/${params.referenceType}/${params.referenceId}/escrow`,
    'POST',
    { action: 'RECORD', userId: params.userId, amountCdf: params.amountCdf, method: 'WALLET' },
  );
}

export async function releaseEscrowPayout(referenceType: string, referenceId: string) {
  return escrowRequest(`/internal/services/${referenceType}/${referenceId}/escrow`, 'POST', {
    action: 'RELEASE',
  });
}

export async function refundEscrow(referenceType: string, referenceId: string, reason?: string) {
  return escrowRequest(`/internal/services/${referenceType}/${referenceId}/escrow`, 'POST', {
    action: 'REFUND',
    reason,
  });
}

export async function settleEscrowPartial(params: {
  referenceType: string;
  referenceId: string;
  courierFeeCdf: number;
  refundCdf: number;
  reason?: string;
}) {
  return escrowRequest(`/internal/services/${params.referenceType}/${params.referenceId}/escrow`, 'POST', {
    action: 'PARTIAL',
    courierFeeCdf: params.courierFeeCdf,
    refundCdf: params.refundCdf,
    reason: params.reason,
  });
}

export async function freezeEscrow(referenceType: string, referenceId: string, reason?: string) {
  return escrowRequest(`/internal/services/${referenceType}/${referenceId}/escrow`, 'POST', {
    action: 'FREEZE',
    reason,
  });
}

/** Crédite uniquement les restaurants (pickup repas) — le livreur reste en séquestre jusqu'au PIN. */
export async function creditRestaurantEscrow(referenceType: string, referenceId: string) {
  return escrowRequest(`/internal/services/${referenceType}/${referenceId}/escrow`, 'POST', {
    action: 'CREDIT_RESTAURANT',
  });
}
