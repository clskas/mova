import 'dart:convert';

import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../config/market_config.dart';

class LocationResult {
  const LocationResult({required this.position, required this.label});

  final LatLng position;
  final String label;
}

/// Position GPS actuelle avec libellé d'adresse (reverse geocoding via passerelle).
///
/// Pas de plugin natif `geocoding` : incompatible Android 7 (GeocodeListener API 33+)
/// et les anciennes versions ne compilent plus avec Flutter récent (embedding v1).
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
      final uri = Uri.parse(
        '${MarketConfig.effectiveApiBaseUrl}/geo/reverse'
        '?lat=${pos.latitude}&lng=${pos.longitude}',
      );
      final response = await http.get(uri).timeout(const Duration(seconds: 8));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return coordsLabel(pos);
      }
      final data = jsonDecode(response.body);
      if (data is! Map) return coordsLabel(pos);
      final label = data['label']?.toString() ?? data['address']?.toString() ?? '';
      if (label.trim().isEmpty) return coordsLabel(pos);
      return label.trim();
    } catch (_) {
      return coordsLabel(pos);
    }
  }

  static String coordsLabel(LatLng pos) =>
      '${pos.latitude.toStringAsFixed(5)}, ${pos.longitude.toStringAsFixed(5)}';
}
