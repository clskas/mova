import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

export type DriverDebtStatusSnapshot = {
  debtBlocked: boolean;
  openDebtCdf: number;
  debtThresholdCdf: number;
  policyActive?: boolean;
  blockOffers?: boolean;
};

export async function fetchDriverDebtStatus(driverUserId: string): Promise<DriverDebtStatusSnapshot> {
  try {
    const res = await fetch(serviceUrl('payment', `/internal/drivers/${driverUserId}/debt-status`), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) {
      return { debtBlocked: false, openDebtCdf: 0, debtThresholdCdf: 0 };
    }
    return (await res.json()) as DriverDebtStatusSnapshot;
  } catch {
    return { debtBlocked: false, openDebtCdf: 0, debtThresholdCdf: 0 };
  }
}

export async function filterDriversNotDebtBlocked(driverUserIds: string[]): Promise<string[]> {
  if (driverUserIds.length === 0) return [];
  try {
    const results = await Promise.all(driverUserIds.map((id) => fetchDriverDebtStatus(id)));
    return driverUserIds.filter((_, i) => !results[i].debtBlocked);
  } catch {
    return driverUserIds;
  }
}
