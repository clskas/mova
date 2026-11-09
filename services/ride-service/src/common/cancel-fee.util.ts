import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

export type CancelFeeResult = { collected: boolean; amountCdf: number; availableCdf?: number };

/** Takes a ride cancellation fee from the passenger's wallet (paid to the driver). Never throws. */
export async function collectCancelFee(params: {
  passengerId: string;
  driverId?: string | null;
  amountCdf: number;
  rideId: string;
}): Promise<CancelFeeResult> {
  try {
    const res = await fetch(serviceUrl('payment', '/internal/cancel-fees/collect'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify(params),
    });
    if (!res.ok) return { collected: false, amountCdf: params.amountCdf };
    return (await res.json()) as CancelFeeResult;
  } catch {
    return { collected: false, amountCdf: params.amountCdf };
  }
}
