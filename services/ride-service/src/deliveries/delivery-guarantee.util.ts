import { HttpStatus } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';

export const PIN_TIMEOUT_MS = {
  PARCEL: 24 * 60 * 60 * 1000,
  EXPRESS: 24 * 60 * 60 * 1000,
  FOOD: 2 * 60 * 60 * 1000,
  ERRAND: 24 * 60 * 60 * 1000,
} as const;

export const UNREACHABLE_ATTEMPTS_BEFORE_RETURN = 3;
export const UNREACHABLE_DELAY_MS = 30 * 60 * 1000;

export type GuaranteePhase = 'BEFORE_PICKUP' | 'AFTER_PICKUP' | 'RETURN_TO_SENDER' | 'PIN_TIMEOUT';

export type EscrowSettlement = {
  action: 'REFUND' | 'PARTIAL' | 'FREEZE';
  courierFeeCdf: number;
  refundCdf: number;
  reason: string;
};

const BEFORE_PICKUP = new Set(['PENDING', 'RESTAURANT_CONFIRMED', 'READY_FOR_PICKUP', 'ASSIGNED']);

export function pinTimeoutMs(type: string): number {
  const key = type.toUpperCase() as keyof typeof PIN_TIMEOUT_MS;
  return PIN_TIMEOUT_MS[key] ?? PIN_TIMEOUT_MS.PARCEL;
}

export function cancelPhase(status: string): Exclude<GuaranteePhase, 'PIN_TIMEOUT' | 'RETURN_TO_SENDER'> {
  if (BEFORE_PICKUP.has(status) || status === 'PENDING') return 'BEFORE_PICKUP';
  return 'AFTER_PICKUP';
}

export function isDeliveryPrepaidRequired(): boolean {
  return process.env.DELIVERY_PREPAID_REQUIRED !== 'false';
}

export type CourierSource = 'PLATFORM' | 'RESTAURANT';
export type RestaurantCourierMode = 'PLATFORM' | 'OWN' | 'HYBRID';

/** Livreur plateforme vs flotte resto : les frais de course ne vont pas dans le pool SENGA. */
export function resolveCourierSource(params: {
  restaurantCourierMode?: string | null;
  driverIsRestaurantFleet?: boolean;
}): CourierSource {
  if (params.driverIsRestaurantFleet) return 'RESTAURANT';
  if (params.restaurantCourierMode === 'OWN') return 'RESTAURANT';
  return 'PLATFORM';
}

export function driverEligibleForFoodOffer(params: {
  courierMode?: string | null;
  driverIsRestaurantFleet: boolean;
}): boolean {
  const mode = (params.courierMode ?? 'PLATFORM').toUpperCase();
  if (mode === 'OWN') return params.driverIsRestaurantFleet;
  if (mode === 'PLATFORM') return true;
  return true;
}

/**
 * Après enlèvement repas : la part resto est déjà créditée (irrévocable).
 * Le reliquat (frais + commission) paie un éventuel frais livreur ; le reste revient au client.
 */
export function settleMealCancelAfterPickup(params: {
  escrowAmountCdf: number;
  restaurantAlreadyCreditedCdf: number;
  deliveryFeeCdf: number;
}): EscrowSettlement {
  const escrow = Math.max(0, Math.round(params.escrowAmountCdf));
  const restaurantKept = Math.max(0, Math.min(escrow, Math.round(params.restaurantAlreadyCreditedCdf)));
  const remaining = Math.max(0, escrow - restaurantKept);
  const courierFeeCdf = Math.max(0, Math.min(remaining, Math.round(params.deliveryFeeCdf)));
  const refundCdf = Math.max(0, remaining - courierFeeCdf);
  return {
    action: remaining === 0 ? 'FREEZE' : 'PARTIAL',
    courierFeeCdf,
    refundCdf,
    reason:
      'Annulation après enlèvement repas : le restaurant conserve sa part (plat déjà sorti). Le livreur peut recevoir les frais ; le reliquat revient au client.',
  };
}

export function settleGuaranteedCancel(params: {
  phase: GuaranteePhase;
  escrowAmountCdf: number;
  deliveryFeeCdf: number;
  restaurantAlreadyCreditedCdf?: number;
}): EscrowSettlement {
  if (
    (params.phase === 'AFTER_PICKUP' || params.phase === 'RETURN_TO_SENDER') &&
    (params.restaurantAlreadyCreditedCdf ?? 0) > 0
  ) {
    return settleMealCancelAfterPickup({
      escrowAmountCdf: params.escrowAmountCdf,
      restaurantAlreadyCreditedCdf: params.restaurantAlreadyCreditedCdf ?? 0,
      deliveryFeeCdf: params.deliveryFeeCdf,
    });
  }
  const escrow = Math.max(0, Math.round(params.escrowAmountCdf));
  const deliveryFee = Math.max(0, Math.min(escrow, Math.round(params.deliveryFeeCdf)));

  if (params.phase === 'PIN_TIMEOUT') {
    return {
      action: 'FREEZE',
      courierFeeCdf: 0,
      refundCdf: 0,
      reason:
        'Délai PIN dépassé : fonds gelés pour le support. Aucun versement automatique au livreur.',
    };
  }

  if (params.phase === 'BEFORE_PICKUP') {
    return {
      action: 'REFUND',
      courierFeeCdf: 0,
      refundCdf: escrow,
      reason: 'Annulation avant enlèvement : remboursement intégral du séquestre (wallet interne).',
    };
  }

  const courierFeeCdf = deliveryFee;
  const refundCdf = Math.max(0, escrow - courierFeeCdf);
  const reason =
    params.phase === 'RETURN_TO_SENDER'
      ? 'Destinataire injoignable (3 tentatives + 30 min) : retour expéditeur. Le livreur reçoit les frais de course ; le reliquat (marchandises) revient au client.'
      : 'Annulation après enlèvement : le livreur reçoit les frais de livraison ; les marchandises / le reliquat reviennent au client.';
  return { action: 'PARTIAL', courierFeeCdf, refundCdf, reason };
}

export function assertEscrowAllowsDispatch(params: {
  guaranteed?: boolean | null;
  escrowReady?: boolean | null;
  fundsFrozenAt?: Date | null;
  escrowAmountCdf?: number | null;
  estimatedPriceCdf?: number | null;
}): void {
  if (!params.guaranteed) return;
  if (params.fundsFrozenAt) {
    throw new MovaHttpException(MovaErrorCode.DELIVERY_FUNDS_FROZEN);
  }
  const due = params.escrowAmountCdf ?? params.estimatedPriceCdf ?? 0;
  if (!params.escrowReady || due <= 0) {
    throw new MovaHttpException(MovaErrorCode.DELIVERY_ESCROW_REQUIRED, HttpStatus.CONFLICT);
  }
}

export function assertPinMatches(expected: string | null | undefined, provided: string | null | undefined): boolean {
  const want = String(expected ?? '').trim();
  const got = String(provided ?? '').trim();
  return Boolean(want) && want === got;
}

export function isPinTimeoutDue(params: {
  type: string;
  status: string;
  fundsFrozenAt?: Date | null;
  payoutReleasedAt?: Date | null;
  inTransitSince?: Date | null;
  now?: Date;
}): boolean {
  if (params.fundsFrozenAt || params.payoutReleasedAt) return false;
  const active = params.status === 'IN_TRANSIT' || params.status === 'COMPLETED';
  if (!active || !params.inTransitSince) return false;
  const now = params.now ?? new Date();
  return now.getTime() - params.inTransitSince.getTime() >= pinTimeoutMs(params.type);
}

export function shouldReturnToSender(params: {
  unreachableAttempts: number;
  firstUnreachableAt?: Date | null;
  now?: Date;
}): boolean {
  if (params.unreachableAttempts < UNREACHABLE_ATTEMPTS_BEFORE_RETURN) return false;
  if (!params.firstUnreachableAt) return false;
  const now = params.now ?? new Date();
  return now.getTime() - params.firstUnreachableAt.getTime() >= UNREACHABLE_DELAY_MS;
}
