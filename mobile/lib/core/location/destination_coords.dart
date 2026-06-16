import 'package:latlong2/latlong.dart';

/// Parse lat/lng depuis un texte « -4.32, 15.31 » ou deux champs séparés.
class DestinationCoords {
  DestinationCoords._();

  static final _pairPattern = RegExp(
    r'^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)\s*$',
  );

  static LatLng? parseText(String text) {
    final m = _pairPattern.firstMatch(text.trim());
    if (m == null) return null;
    return fromFields(m.group(1)!, m.group(2)!);
  }

  static LatLng? fromFields(String latText, String lngText) {
    final lat = double.tryParse(latText.trim().replaceAll(',', '.'));
    final lng = double.tryParse(lngText.trim().replaceAll(',', '.'));
    if (lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return LatLng(lat, lng);
  }
}
