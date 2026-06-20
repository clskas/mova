import { HttpStatus } from '@nestjs/common';
import { INTERNAL_API_KEY, MovaErrorCode, MovaHttpException, serviceUrl } from '@mova/shared';

export type DriverProfileSnapshot = {
  isAvailable?: boolean;
  kycStatus?: string;
  documentsStatus?: {
    canOperate?: boolean;
    blockReason?: string;
  };
  currentLat?: number | null;
  currentLng?: number | null;
  operatingCity?: string | null;
  ratingAvg?: number;
  vehicles?: { id: string; type: string; isActive?: boolean }[];
};

export async function fetchDriverProfileSnapshot(userId: string): Promise<DriverProfileSnapshot | null> {
  try {
    const res = await fetch(serviceUrl('driver', `/internal/drivers/${userId}`), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) return null;
    return (await res.json()) as DriverProfileSnapshot;
  } catch {
    return null;
  }
}

export function driverCanReceiveJobs(profile: DriverProfileSnapshot | null | undefined): boolean {
  if (!profile || profile.kycStatus !== 'APPROVED') return false;
  return profile.documentsStatus?.canOperate === true;
}

export async function assertDriverCanReceiveJobs(userId: string): Promise<DriverProfileSnapshot> {
  const profile = await fetchDriverProfileSnapshot(userId);
  if (!profile || profile.kycStatus !== 'APPROVED') {
    throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING, HttpStatus.FORBIDDEN);
  }
  if (!profile.documentsStatus?.canOperate) {
    throw new MovaHttpException(
      MovaErrorCode.DRIVER_DOCUMENTS_EXPIRED,
      HttpStatus.FORBIDDEN,
      profile.documentsStatus?.blockReason,
    );
  }
  return profile;
}
