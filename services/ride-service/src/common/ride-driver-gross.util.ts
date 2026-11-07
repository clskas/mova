/**
 * Tarif de base chauffeur pour une course (ou service similaire) :
 * le passager paie le prix remisé ; SENGA absorbe la promo plateforme.
 * Le chauffeur est rémunéré sur le tarif plein (= payé + remise).
 */
export function rideDriverGrossCdf(input: {
  finalFareCdf?: number | null;
  estimatedFareCdf?: number | null;
  /** Alias pour scheduled / moving / errand (prix payé par le client). */
  estimatedPriceCdf?: number | null;
  finalPriceCdf?: number | null;
  discountCdf?: number | null;
}): number {
  const passengerPaid = Math.max(
    0,
    input.finalFareCdf ??
      input.estimatedFareCdf ??
      input.finalPriceCdf ??
      input.estimatedPriceCdf ??
      0,
  );
  const platformAbsorb = Math.max(0, input.discountCdf ?? 0);
  return passengerPaid + platformAbsorb;
}

/**
 * Pool : la remise plateforme est sur la course parente — on la répartit
 * entre les bookings pour que le total chauffeur = somme des tarifs + remise.
 */
export function rideShareBookingDriverGrossCdf(
  bookingFareCdf: number,
  rideDiscountCdf: number | null | undefined,
  bookingCountOnRide: number,
): number {
  const n = Math.max(1, bookingCountOnRide);
  const absorbShare = Math.round(Math.max(0, rideDiscountCdf ?? 0) / n);
  return Math.max(0, bookingFareCdf) + absorbShare;
}

/**
 * Errand: SENGA's commission applies to the service fee only. The purchases are the
 * shop's money, advanced by the courier, and are paid back in full.
 */
export function errandDriverNetCdf(
  feeGrossCdf: number,
  purchaseCdf: number | null | undefined,
  platformPercent: number,
): number {
  const pct = Math.min(100, Math.max(0, Number.isFinite(platformPercent) ? platformPercent : 0));
  const fee = Math.max(0, feeGrossCdf);
  const feeNet = fee - Math.ceil(fee * (pct / 100));
  return Math.round(feeNet + Math.max(0, purchaseCdf ?? 0));
}
