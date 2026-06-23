/// Utilitaires options location — alignés sur `packages/shared/rental-addons.util.ts`.
class RentalAddons {
  RentalAddons._();

  static bool vehicleHasBuiltInGps(List<dynamic>? features) {
    if (features == null || features.isEmpty) return false;
    for (final f in features) {
      final normalized = f.toString().trim().toLowerCase();
      if (normalized == 'gps' || normalized.contains('navigation')) {
        return true;
      }
    }
    return false;
  }

  static bool shouldChargeGps(List<dynamic>? features, bool gpsSelected) {
    if (!gpsSelected) return false;
    return !vehicleHasBuiltInGps(features);
  }
}
