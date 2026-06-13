import 'package:latlong2/latlong.dart';

import 'service_areas.dart';

/// Validation GPS et géocodage stub par zone de service MOVA.
class ServiceAreaLocation {
  ServiceAreaLocation._();

  static ServiceArea areaFor(String areaId) =>
      ServiceAreas.byId(areaId) ?? ServiceAreas.defaultArea;

  static LatLng get defaultCenter => ServiceAreas.defaultArea.center;

  static LatLng centerFor([String? areaId]) {
    final area = areaId != null ? areaFor(areaId) : ServiceAreas.defaultArea;
    return area.center;
  }

  static LatLng defaultDropoffOffset([String? areaId]) {
    final c = centerFor(areaId);
    return LatLng(c.latitude - 0.03, c.longitude + 0.04);
  }

  static bool isInBounds(LatLng coords, {String? areaId}) {
    if (areaId != null) return areaFor(areaId).contains(coords);
    return ServiceAreas.byCoords(coords) != null;
  }

  static bool addressMentionsArea(String address, {String? areaId}) {
    final lower = address.toLowerCase();
    if (areaId != null) {
      final area = areaFor(areaId);
      if (lower.contains(area.name.toLowerCase())) return true;
      return area.districts.keys
          .any((name) => lower.contains(name.toLowerCase()));
    }
    return ServiceAreas.byName(address) != null ||
        ServiceAreas.defaultArea.districts.keys
            .any((name) => lower.contains(name.toLowerCase())) ||
        lower.contains('kinshasa');
  }

  static LatLng? districtFromAddress(String address, {String? areaId}) {
    final lower = address.toLowerCase();
    final area = areaId != null ? areaFor(areaId) : ServiceAreas.byName(address);
    final districts = area?.districts ?? ServiceAreas.defaultArea.districts;
    for (final entry in districts.entries) {
      if (lower.contains(entry.key.toLowerCase())) return entry.value;
    }
    if (area != null && lower.contains(area.name.toLowerCase())) {
      return area.center;
    }
    if (lower.contains('kinshasa')) return ServiceAreas.defaultArea.center;
    return null;
  }

  static LatLng coordsFromAddress(String address, {String? areaId}) {
    final fromDistrict = districtFromAddress(address, areaId: areaId);
    if (fromDistrict != null) return fromDistrict;
    final area = areaId != null ? areaFor(areaId) : ServiceAreas.defaultArea;
    var hash = 0;
    for (final code in address.runes) {
      hash = (hash + code) % 1000;
    }
    return LatLng(
      area.center.latitude - 0.01 - (hash % 50) / 10000,
      area.center.longitude + 0.01 + ((hash ~/ 50) % 50) / 10000,
    );
  }

  static bool destinationInServiceArea(
    String address, {
    LatLng? coords,
    bool fromSuggestion = false,
    String? areaId,
  }) {
    if (addressMentionsArea(address, areaId: areaId) ||
        districtFromAddress(address, areaId: areaId) != null) {
      return true;
    }
    if (fromSuggestion && coords != null && isInBounds(coords, areaId: areaId)) {
      return true;
    }
    if (coords != null && isInBounds(coords)) return true;
    return false;
  }

  static LatLng ensureInServiceArea(
    LatLng coords, {
    String? address,
    String? areaId,
  }) {
    if (isInBounds(coords, areaId: areaId)) return coords;
    if (address != null && address.trim().isNotEmpty) {
      final fromAddress = districtFromAddress(address, areaId: areaId);
      if (fromAddress != null) return fromAddress;
      if (addressMentionsArea(address, areaId: areaId)) {
        return coordsFromAddress(address, areaId: areaId);
      }
    }
    return centerFor(areaId);
  }

  static String outOfAreaMessage() =>
      'MOVA couvre ${ServiceAreas.coverageMessage()}. Choisissez une adresse dans une ville desservie.';

  /// @deprecated Utiliser [districtFromAddress]
  static LatLng? communeFromAddress(String address, {String? areaId}) =>
      districtFromAddress(address, areaId: areaId);

  /// @deprecated Utiliser [ensureInServiceArea]
  static LatLng ensureInKinshasa(LatLng coords, {String? address, String? areaId}) =>
      ensureInServiceArea(coords, address: address, areaId: areaId);
}

typedef KinshasaLocation = ServiceAreaLocation;
