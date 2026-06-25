import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

export type RidePaymentStatus = {
  rideId: string;
  isPaid: boolean;
  paymentStatus: string | null;
};

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
