/** Détecte un GPS intégré dans les caractéristiques véhicule (fiche propriétaire). */
export function vehicleHasBuiltInGps(features: unknown): boolean {
  if (!Array.isArray(features)) return false;
  return features.some((f) => {
    const normalized = String(f).trim().toLowerCase();
    return normalized === 'gps' || normalized.includes('navigation');
  });
}

export type RentalAddOnsInput = {
  childSeat?: boolean;
  gps?: boolean;
  extraDriver?: boolean;
};

/** Ne facture pas le GPS si déjà intégré au véhicule. */
export function shouldChargeGpsAddOn(features: unknown, addOns: RentalAddOnsInput): boolean {
  if (!addOns.gps) return false;
  return !vehicleHasBuiltInGps(features);
}
