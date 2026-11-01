import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

export type RidePaymentStatus = {
  rideId: string;
  isPaid: boolean;
  paymentStatus: string | null;
  paymentMethod?: string | null;
  amountCdf?: number | null;
  /** Espèces signalées non reçues — seul cas qui rebloque le passager. */
  cashDisputed?: boolean;
  passengerClaimedPaid?: boolean;
};

export type ServicePaymentStatus = {
  referenceType: string;
  referenceId: string;
  isPaid: boolean;
  paymentStatus: string | null;
  paymentMethod?: string | null;
  amountCdf?: number | null;
  escrowHeld?: boolean;
  payoutReleased?: boolean;
  fundsFrozen?: boolean;
  cashDisputed?: boolean;
  passengerClaimedPaid?: boolean;
};

/** Soft cash: PENDING espèces sans litige → passager libre de commander. */
export function isHardUnpaidBlock(pay: {
  isPaid: boolean;
  paymentMethod?: string | null;
  cashDisputed?: boolean;
}): boolean {
  if (pay.isPaid) return false;
  const method = (pay.paymentMethod ?? '').toUpperCase();
  if (method === 'CASH' && !pay.cashDisputed) return false;
  return true;
}

export async function fetchServicePaymentStatuses(
  referenceType: string,
  referenceIds: string[],
): Promise<Record<string, ServicePaymentStatus>> {
  const type = referenceType.toUpperCase();
  const unique = [...new Set(referenceIds.filter(Boolean))];
  if (unique.length === 0) return {};
  try {
    const res = await fetch(serviceUrl('payment', '/internal/services/payment-status'), {
      method: 'POST',
      headers: {
        'x-internal-api-key': INTERNAL_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ referenceType: type, referenceIds: unique }),
    });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, ServicePaymentStatus>;
  } catch {
    return {};
  }
}

export async function fetchRidePaymentStatus(rideId: string): Promise<RidePaymentStatus> {
  try {
    const res = await fetch(serviceUrl('payment', `/internal/rides/${rideId}/payment-status`), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) {
      return { rideId, isPaid: false, paymentStatus: null };
    }
    return (await res.json()) as RidePaymentStatus;
  } catch {
    return { rideId, isPaid: false, paymentStatus: null };
  }
}

export async function fetchServicePaymentStatus(
  referenceType: string,
  referenceId: string,
): Promise<ServicePaymentStatus> {
  const type = referenceType.toUpperCase();
  try {
    const res = await fetch(
      serviceUrl('payment', `/internal/services/${type}/${referenceId}/payment-status`),
      { headers: { 'x-internal-api-key': INTERNAL_API_KEY } },
    );
    if (!res.ok) {
      return { referenceType: type, referenceId, isPaid: false, paymentStatus: null };
    }
    return (await res.json()) as ServicePaymentStatus;
  } catch {
    return { referenceType: type, referenceId, isPaid: false, paymentStatus: null };
  }
}

export async function fetchRidePaymentStatuses(rideIds: string[]): Promise<Record<string, RidePaymentStatus>> {
  if (rideIds.length === 0) return {};
  try {
    const res = await fetch(serviceUrl('payment', '/internal/rides/payment-status'), {
      method: 'POST',
      headers: {
        'x-internal-api-key': INTERNAL_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ rideIds }),
    });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, RidePaymentStatus>;
  } catch {
    return {};
  }
}
