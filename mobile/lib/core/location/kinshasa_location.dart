import 'package:latlong2/latlong.dart';

import '../config/market_config.dart';

/// Bornes GPS alignées sur les communes seed Kinshasa (packages/shared).
class KinshasaLocation {
  KinshasaLocation._();

  static const double _padding = 0.02;

  static const _communeCoords = <String, LatLng>{
    'Gombe': LatLng(-4.3217, 15.3125),
    'Limete': LatLng(-4.3389, 15.3264),
    'Masina': LatLng(-4.3833, 15.3917),
    'Ngaliema': LatLng(-4.3833, 15.25),
    'Kintambo': LatLng(-4.3167, 15.2833),
    'Bandalungwa': LatLng(-4.35, 15.2833),
    'Kalamu': LatLng(-4.35, 15.3167),
    'Barumbu': LatLng(-4.3333, 15.3),
    'Kinshasa': LatLng(-4.325, 15.3222),
    'Lingwala': LatLng(-4.3167, 15.3),
    'Matete': LatLng(-4.3667, 15.35),
    'Ndjili': LatLng(-4.4, 15.4167),
    'Selembao': LatLng(-4.3833, 15.35),
    'Mont-Ngafula': LatLng(-4.4167, 15.2333),
    'Ngaba': LatLng(-4.3667, 15.2833),
    'Bumbu': LatLng(-4.35, 15.2833),
    'Makala': LatLng(-4.3667, 15.2667),
    'Nsele': LatLng(-4.3667, 15.4667),
    'Maluku': LatLng(-4.0833, 15.5833),
    'Kimbanseke': LatLng(-4.4167, 15.3833),
    'Kasa-Vubu': LatLng(-4.3333, 15.2833),
    'Lemba': LatLng(-4.3833, 15.3167),
  };

  static double get minLat =>
      _communeCoords.values.map((p) => p.latitude).reduce((a, b) => a < b ? a : b) - _padding;
  static double get maxLat =>
      _communeCoords.values.map((p) => p.latitude).reduce((a, b) => a > b ? a : b) + _padding;
  static double get minLng =>
      _communeCoords.values.map((p) => p.longitude).reduce((a, b) => a < b ? a : b) - _padding;
  static double get maxLng =>
      _communeCoords.values.map((p) => p.longitude).reduce((a, b) => a > b ? a : b) + _padding;

  static LatLng get defaultCenter =>
      LatLng(MarketConfig.defaultLat, MarketConfig.defaultLng);

  static LatLng defaultDropoffOffset() => LatLng(
        MarketConfig.defaultLat - 0.03,
        MarketConfig.defaultLng + 0.04,
      );

  static bool isInBounds(LatLng coords) =>
      coords.latitude >= minLat &&
      coords.latitude <= maxLat &&
      coords.longitude >= minLng &&
      coords.longitude <= maxLng;

  static bool addressMentionsKinshasa(String address) {
    final lower = address.toLowerCase();
    return lower.contains('kinshasa') ||
        MarketConfig.kinshasaCommunes
            .any((name) => lower.contains(name.toLowerCase()));
  }

  static LatLng? communeFromAddress(String address) {
    final lower = address.toLowerCase();
    for (final entry in _communeCoords.entries) {
      if (lower.contains(entry.key.toLowerCase())) {
        return entry.value;
      }
    }
    if (lower.contains('kinshasa')) return defaultCenter;
    return null;
  }

  /// Dérive des coords stables à partir du texte (aligné backend addressToCoords).
  static LatLng coordsFromAddress(String address) {
    final fromCommune = communeFromAddress(address);
    if (fromCommune != null) return fromCommune;
    var hash = 0;
    for (final code in address.runes) {
      hash = (hash + code) % 1000;
    }
    return LatLng(
      MarketConfig.defaultLat - 0.01 - (hash % 50) / 10000,
      MarketConfig.defaultLng + 0.01 + ((hash ~/ 50) % 50) / 10000,
    );
  }

  /// Garde des coords valides Kinshasa ; snap via adresse ou centre Gombe.
  static LatLng ensureInKinshasa(LatLng coords, {String? address}) {
    if (isInBounds(coords)) return coords;
    if (address != null && address.trim().isNotEmpty) {
      final fromAddress = communeFromAddress(address);
      if (fromAddress != null && isInBounds(fromAddress)) return fromAddress;
      if (addressMentionsKinshasa(address)) return coordsFromAddress(address);
    }
    return defaultCenter;
  }
}
