import { HttpStatus } from '@nestjs/common';
import {
  driverEligibleForMoving,
  driverEligibleForParcelWeight,
  driverEligibleForRide,
  INTERNAL_API_KEY,
  MovaErrorCode,
  MovaHttpException,
  normalizeVehicleType,
  serviceUrl,
  VehicleTypeValue,
} from '@mova/shared';
import { fetchDriverDebtStatus } from './driver-debt.util';

export type DriverProfileSnapshot = {
  isAvailable?: boolean;
  kycStatus?: string;
  activationPinVerified?: boolean;
  activationPinVerifiedAt?: string | Date | null;
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
  const pinVerified =
    profile.activationPinVerified === true ||
    profile.activationPinVerifiedAt != null;
  if (!pinVerified) return false;
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
  const pinVerified =
    profile.activationPinVerified === true ||
    profile.activationPinVerifiedAt != null;
  if (!pinVerified) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      HttpStatus.FORBIDDEN,
      'Activez votre compte avec le code PIN reçu après validation SENGA.',
    );
  }
  const debtStatus = await fetchDriverDebtStatus(userId);
  if (debtStatus.debtBlocked) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      HttpStatus.FORBIDDEN,
      `Dette espèces (${debtStatus.openDebtCdf} FC) au-dessus du seuil (${debtStatus.debtThresholdCdf} FC). Réglez votre dette pour recevoir des courses.`,
    );
  }
  return profile;
}

export async function assertDriverEligibleForMoving(
  userId: string,
  vehicleCategory: string,
): Promise<DriverProfileSnapshot> {
  const profile = await assertDriverCanReceiveJobs(userId);
  const types = (profile.vehicles ?? [])
    .filter((v) => v.isActive !== false)
    .map((v) => {
      try {
        return normalizeVehicleType(v.type) as VehicleTypeValue;
      } catch {
        return null;
      }
    })
    .filter((t): t is VehicleTypeValue => t != null);
  if (!driverEligibleForMoving(types, vehicleCategory)) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      HttpStatus.FORBIDDEN,
      'Ce chauffeur n\'a pas d\'engin adapté au déménagement (moto-taxi exclu).',
    );
  }
  return profile;
}

export async function assertDriverEligibleForRide(
  userId: string,
  rideVehicleType: string,
): Promise<DriverProfileSnapshot> {
  const profile = await assertDriverCanReceiveJobs(userId);
  const types = (profile.vehicles ?? [])
    .filter((v) => v.isActive !== false)
    .map((v) => {
      try {
        return normalizeVehicleType(v.type) as VehicleTypeValue;
      } catch {
        return null;
      }
    })
    .filter((t): t is VehicleTypeValue => t != null);
  if (!driverEligibleForRide(types, rideVehicleType)) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      HttpStatus.FORBIDDEN,
      'Véhicule du chauffeur incompatible avec le type de course demandé.',
    );
  }
  return profile;
}

export async function assertDriverEligibleForRentalLogistics(userId: string): Promise<DriverProfileSnapshot> {
  const profile = await assertDriverCanReceiveJobs(userId);
  const types = (profile.vehicles ?? [])
    .filter((v) => v.isActive !== false)
    .map((v) => {
      try {
        return normalizeVehicleType(v.type) as VehicleTypeValue;
      } catch {
        return null;
      }
    })
    .filter((t): t is VehicleTypeValue => t != null);
  const hasCargo = types.some(
    (t) => t === 'STANDARD' || t === 'COMFORT' || t === 'VIP' || t === 'UTILITAIRE' || t === 'CAMION',
  );
  if (!hasCargo) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      HttpStatus.FORBIDDEN,
      'Ce chauffeur n\'a pas d\'engin adapté à la logistique location (moto-taxi exclu).',
    );
  }
  return profile;
}

export async function assertDriverEligibleForParcel(
  userId: string,
  weightCategory: string | null | undefined,
): Promise<DriverProfileSnapshot> {
  const profile = await assertDriverCanReceiveJobs(userId);
  const types = (profile.vehicles ?? [])
    .filter((v) => v.isActive !== false)
    .map((v) => {
      try {
        return normalizeVehicleType(v.type) as VehicleTypeValue;
      } catch {
        return null;
      }
    })
    .filter((t): t is VehicleTypeValue => t != null);
  if (!driverEligibleForParcelWeight(types, weightCategory)) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      HttpStatus.FORBIDDEN,
      'Engin incompatible avec le poids du colis (voiture requise pour colis moyen/grand).',
    );
  }
  return profile;
}
