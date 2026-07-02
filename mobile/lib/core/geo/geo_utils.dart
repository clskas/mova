import 'dart:math' as math;

/// Calculs géographiques alignés sur ride-service (25 km/h urbain).
abstract final class GeoUtils {
  static const urbanSpeedKmh = 25.0;

  static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
    const r = 6371.0;
    final dLat = _toRad(lat2 - lat1);
    final dLng = _toRad(lng2 - lng1);
    final a = math.pow(math.sin(dLat / 2), 2) +
        math.cos(_toRad(lat1)) * math.cos(_toRad(lat2)) * math.pow(math.sin(dLng / 2), 2);
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  static int etaMinutesFromDistanceKm(double distanceKm) {
    final minutes = (distanceKm / urbanSpeedKmh * 60).ceil();
    return minutes < 1 ? 1 : minutes;
  }

  /// Affiche en mètres si < 1 km, sinon en km avec une décimale.
  static String formatDistanceKm(double distanceKm) {
    if (distanceKm < 1) {
      final meters = (distanceKm * 1000).round();
      return '$meters m';
    }
    return '${distanceKm.toStringAsFixed(1)} km';
  }

  static String formatDistanceLabel(double distanceKm, {String prefix = ''}) {
    final formatted = formatDistanceKm(distanceKm);
    return prefix.isEmpty ? formatted : '$prefix$formatted';
  }

  static int driverEtaMinutes(double driverLat, double driverLng, double targetLat, double targetLng) {
    final km = haversineKm(driverLat, driverLng, targetLat, targetLng);
    return etaMinutesFromDistanceKm(km);
  }

  static double _toRad(double deg) => deg * math.pi / 180;
}
