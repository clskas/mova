import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../config/market_config.dart';
import 'location_service.dart';
import 'service_area_prefs.dart';
import 'service_areas.dart';

/// Détecte la ville MOVA la plus proche du GPS et met à jour la préférence.
class ServiceAreaGps {
  static Future<ServiceArea?> sync(WidgetRef ref) async {
    final location = await LocationService.getCurrentLocation();
    if (location == null) return null;

    final lat = location.position.latitude;
    final lng = location.position.longitude;
    if (!MarketConfig.isInDrcTerritory(lat, lng)) return null;

    final area =
        ServiceAreas.byCoords(location.position) ?? ServiceAreas.nearest(location.position);
    final prefs = await ref.read(serviceAreaPrefsProvider.future);
    await prefs.setSelectedAreaId(area.id);
    ref.invalidate(serviceAreaPrefsProvider);
    return area;
  }

  /// Sans Riverpod (tests).
  static ServiceArea areaForCoords(LatLng coords) =>
      ServiceAreas.byCoords(coords) ?? ServiceAreas.nearest(coords);
}
