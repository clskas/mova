import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

class LocationResult {
  const LocationResult({required this.position, required this.label});

  final LatLng position;
  final String label;
}

/// Position GPS actuelle avec libellé d'adresse (reverse geocoding).
class LocationService {
  static Future<LocationResult?> getCurrentLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return null;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }

    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
    );
    final latLng = LatLng(pos.latitude, pos.longitude);
    final label = await _reverseGeocode(latLng);
    return LocationResult(position: latLng, label: label);
  }

  static Future<String> labelForCoords(LatLng pos) => _reverseGeocode(pos);

  static Future<String> _reverseGeocode(LatLng pos) async {
    try {
      final placemarks = await placemarkFromCoordinates(pos.latitude, pos.longitude);
      if (placemarks.isEmpty) return coordsLabel(pos);
      final p = placemarks.first;
      final parts = <String>[
        if (p.street != null && p.street!.isNotEmpty) p.street!,
        if (p.subLocality != null && p.subLocality!.isNotEmpty) p.subLocality!,
        if (p.locality != null && p.locality!.isNotEmpty) p.locality!,
        if (p.administrativeArea != null && p.administrativeArea!.isNotEmpty)
          p.administrativeArea!,
      ];
      if (parts.isNotEmpty) return parts.join(', ');
      return coordsLabel(pos);
    } catch (_) {
      return coordsLabel(pos);
    }
  }

  static String coordsLabel(LatLng pos) =>
      '${pos.latitude.toStringAsFixed(5)}, ${pos.longitude.toStringAsFixed(5)}';
}
