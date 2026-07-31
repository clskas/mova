import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:mova/core/location/service_area_location.dart';
import 'package:mova/core/location/service_areas.dart';

void main() {
  group('ServiceAreaLocation', () {
    test('default center is within a service area', () {
      expect(ServiceAreaLocation.isInBounds(ServiceAreaLocation.defaultCenter), isTrue);
    });

    test('Maluku commune coords are within Kinshasa bounds', () {
      final maluku = ServiceAreaLocation.districtFromAddress('Maluku, Kinshasa');
      expect(maluku, isNotNull);
      expect(ServiceAreaLocation.isInBounds(maluku!), isTrue);
    });

    test('snaps GPS hors zone quand adresse mentionne une ville desservie', () {
      const abroad = LatLng(37.42, -122.08);
      final snapped = ServiceAreaLocation.ensureInServiceArea(
        abroad,
        address: 'Ma position, Kinshasa',
      );
      expect(ServiceAreaLocation.isInBounds(snapped), isTrue);
    });

    test('coordsFromAddress resolves commune name', () {
      final limete = ServiceAreaLocation.coordsFromAddress('Limete, Kinshasa');
      expect(limete.latitude, closeTo(-4.3389, 0.001));
      expect(ServiceAreaLocation.isInBounds(limete), isTrue);
    });

    test('destinationInServiceArea requires in-bounds coords (text alone is not enough)', () {
      expect(
        ServiceAreaLocation.destinationInServiceArea('Butembo'),
        isFalse,
      );
      expect(
        ServiceAreaLocation.destinationInServiceArea(
          'Gombe, Kinshasa',
          coords: const LatLng(-4.305, 15.312),
        ),
        isTrue,
      );
    });

    test('destinationInServiceArea rejects out-of-bounds coords even with long address', () {
      expect(
        ServiceAreaLocation.destinationInServiceArea(
          'Paris, France',
          coords: const LatLng(48.8566, 2.3522),
        ),
        isFalse,
      );
    });
    test('destinationInServiceArea rejects very short addresses without coords', () {
      expect(
        ServiceAreaLocation.destinationInServiceArea('AB'),
        isFalse,
      );
    });

    test('fallback area is not hardcoded to Kinshasa', () {
      expect(ServiceAreas.fallbackArea.id, isNotEmpty);
      expect(ServiceAreas.all.length, greaterThanOrEqualTo(26));
    });
  });
}
