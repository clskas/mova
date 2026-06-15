import 'package:latlong2/latlong.dart';

import '../config/market_config.dart';

class ServiceArea {
  const ServiceArea({
    required this.id,
    required this.name,
    required this.province,
    required this.center,
    required this.minLat,
    required this.maxLat,
    required this.minLng,
    required this.maxLng,
    this.districts = const {},
  });

  final String id;
  final String name;
  final String province;
  final LatLng center;
  final double minLat;
  final double maxLat;
  final double minLng;
  final double maxLng;
  final Map<String, LatLng> districts;

  bool contains(LatLng coords) =>
      coords.latitude >= minLat &&
      coords.latitude <= maxLat &&
      coords.longitude >= minLng &&
      coords.longitude <= maxLng;
}

/// Zones MOVA — capitales provinciales + grandes villes (aligné packages/shared).
class ServiceAreas {
  ServiceAreas._();

  /// Quartiers Kinshasa — données géographiques uniquement, pas de privilège par défaut.
  static const _kinshasaDistricts = <String, LatLng>{
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

  static ServiceArea _box(
    String id,
    String name,
    String province,
    double lat,
    double lng, {
    double radius = 0.12,
    Map<String, LatLng> districts = const {},
  }) {
    final kinBounds = id == 'kinshasa';
    final minLat = kinBounds
        ? _kinshasaDistricts.values.map((p) => p.latitude).reduce((a, b) => a < b ? a : b) - 0.02
        : lat - radius;
    final maxLat = kinBounds
        ? _kinshasaDistricts.values.map((p) => p.latitude).reduce((a, b) => a > b ? a : b) + 0.02
        : lat + radius;
    final minLng = kinBounds
        ? _kinshasaDistricts.values.map((p) => p.longitude).reduce((a, b) => a < b ? a : b) - 0.02
        : lng - radius;
    final maxLng = kinBounds
        ? _kinshasaDistricts.values.map((p) => p.longitude).reduce((a, b) => a > b ? a : b) + 0.02
        : lng + radius;
    return ServiceArea(
      id: id,
      name: name,
      province: province,
      center: LatLng(lat, lng),
      minLat: minLat,
      maxLat: maxLat,
      minLng: minLng,
      maxLng: maxLng,
      districts: districts,
    );
  }

  static final List<ServiceArea> all = [
    _box('kinshasa', 'Kinshasa', 'Kinshasa', -4.3217, 15.3125, districts: _kinshasaDistricts),
    _box('lubumbashi', 'Lubumbashi', 'Haut-Katanga', -11.6647, 27.4794),
    _box('goma', 'Goma', 'Nord-Kivu', -1.6788, 29.2175),
    _box('bukavu', 'Bukavu', 'Sud-Kivu', -2.4908, 28.8428),
    _box('kisangani', 'Kisangani', 'Tshopo', 0.5153, 25.191),
    _box('mbuji-mayi', 'Mbuji-Mayi', 'Kasaï-Oriental', -6.136, 23.5898),
    _box('kananga', 'Kananga', 'Kasaï-Central', -5.8962, 22.4167),
    _box('matadi', 'Matadi', 'Kongo Central', -5.8167, 13.45),
    _box('boma', 'Boma', 'Kongo Central', -5.85, 13.05, radius: 0.08),
    _box('kolwezi', 'Kolwezi', 'Lualaba', -10.7167, 25.4667),
    _box('likasi', 'Likasi', 'Haut-Katanga', -10.9833, 26.7333),
    _box('tshikapa', 'Tshikapa', 'Kasaï', -6.4167, 20.8),
    _box('mbandaka', 'Mbandaka', 'Équateur', 0.0478, 18.2603),
    _box('kindu', 'Kindu', 'Maniema', -2.95, 25.95),
    _box('bunia', 'Bunia', 'Ituri', 1.5594, 30.2528),
    _box('butembo', 'Butembo', 'Nord-Kivu', 0.141, 29.291, radius: 0.08),
    _box('beni', 'Beni', 'Nord-Kivu', 0.491, 29.473, radius: 0.08),
    _box('uvira', 'Uvira', 'Sud-Kivu', -3.4, 29.1333, radius: 0.08),
    _box('kalemie', 'Kalemie', 'Tanganyika', -5.93, 29.1928),
    _box('kamina', 'Kamina', 'Haut-Lomami', -8.7333, 25.0),
    _box('gbadolite', 'Gbadolite', 'Nord-Ubangi', 4.2833, 21.0167, radius: 0.08),
    _box('gemena', 'Gemena', 'Sud-Ubangi', 3.2517, 19.7725, radius: 0.08),
    _box('boende', 'Boende', 'Tshuapa', -0.2167, 20.8833, radius: 0.08),
    _box('lisala', 'Lisala', 'Mongala', 2.15, 21.5167, radius: 0.08),
    _box('isiro', 'Isiro', 'Haut-Uele', 2.7833, 27.6167, radius: 0.08),
    _box('buta', 'Buta', 'Bas-Uele', 2.8167, 24.7333, radius: 0.08),
    _box('inongo', 'Inongo', 'Mai-Ndombe', -1.95, 18.2833, radius: 0.08),
    _box('bandundu', 'Bandundu', 'Kwilu', -3.3167, 17.3667, radius: 0.08),
    _box('kikwit', 'Kikwit', 'Kwilu', -5.04, 18.8167),
    _box('kenge', 'Kenge', 'Kwango', -4.8167, 17.0333, radius: 0.08),
    _box('kabinda', 'Kabinda', 'Lomami', -6.1375, 24.4278, radius: 0.08),
    _box('lusambo', 'Lusambo', 'Sankuru', -4.975, 23.4436, radius: 0.08),
  ];

  static ServiceArea get fallbackArea => nearest(const LatLng(
        MarketConfig.mapCenterLat,
        MarketConfig.mapCenterLng,
      ));

  /// @deprecated Utiliser [fallbackArea] — conservé pour compatibilité interne.
  static ServiceArea get defaultArea => fallbackArea;

  static ServiceArea? byId(String id) {
    for (final area in all) {
      if (area.id == id) return area;
    }
    return null;
  }

  static ServiceArea? byName(String name) {
    final lower = name.toLowerCase();
    for (final area in all) {
      if (area.name.toLowerCase() == lower) return area;
    }
    for (final area in all) {
      if (lower.contains(area.name.toLowerCase())) return area;
    }
    return null;
  }

  static ServiceArea? byCoords(LatLng coords) {
    for (final area in all) {
      if (area.contains(coords)) return area;
    }
    return null;
  }

  static ServiceArea nearest(LatLng coords) {
    ServiceArea? best;
    var bestDist = double.infinity;
    for (final area in all) {
      final d = const Distance().as(
        LengthUnit.Kilometer,
        coords,
        area.center,
      );
      if (d < bestDist) {
        bestDist = d;
        best = area;
      }
    }
    return best ?? fallbackArea;
  }

  static String coverageMessage({int max = 8}) {
    final names = all.map((a) => a.name).toList();
    if (names.length <= max) return names.join(', ');
    return '${names.take(max).join(', ')}… (+${names.length - max} villes)';
  }
}
