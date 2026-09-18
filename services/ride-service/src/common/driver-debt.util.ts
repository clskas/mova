import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

export type DriverDebtStatusSnapshot = {
  debtBlocked: boolean;
  walletBlocked?: boolean;
  offersBlocked?: boolean;
  openDebtCdf: number;
  debtThresholdCdf: number;
  walletBalanceCdf?: number;
  policyActive?: boolean;
  blockOffers?: boolean;
  requirePositiveWalletBalance?: boolean;
};

export async function fetchDriverDebtStatus(driverUserId: string): Promise<DriverDebtStatusSnapshot> {
  try {
    const res = await fetch(serviceUrl('payment', `/internal/drivers/${driverUserId}/debt-status`), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) {
      return { debtBlocked: false, walletBlocked: false, offersBlocked: false, openDebtCdf: 0, debtThresholdCdf: 0 };
    }
    const data = (await res.json()) as DriverDebtStatusSnapshot;
    const walletBlocked = data.walletBlocked === true;
    const debtBlocked = data.debtBlocked === true;
    return {
      ...data,
      debtBlocked,
      walletBlocked,
      offersBlocked: data.offersBlocked === true || debtBlocked || walletBlocked,
    };
  } catch {
    return { debtBlocked: false, walletBlocked: false, offersBlocked: false, openDebtCdf: 0, debtThresholdCdf: 0 };
  }
}

export async function filterDriversNotDebtBlocked(driverUserIds: string[]): Promise<string[]> {
  if (driverUserIds.length === 0) return [];
  try {
    const results = await Promise.all(driverUserIds.map((id) => fetchDriverDebtStatus(id)));
    return driverUserIds.filter((_, i) => !results[i].offersBlocked && !results[i].debtBlocked && !results[i].walletBlocked);
  } catch {
    return driverUserIds;
  }
}
