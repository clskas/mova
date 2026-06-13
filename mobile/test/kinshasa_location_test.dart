import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:mova/core/location/kinshasa_location.dart';
import 'package:mova/core/location/service_areas.dart';

void main() {
  group('ServiceAreaLocation', () {
    test('default center is within bounds', () {
      expect(KinshasaLocation.isInBounds(KinshasaLocation.defaultCenter), isTrue);
    });

    test('Maluku commune coords are within bounds', () {
      final maluku = KinshasaLocation.communeFromAddress('Maluku, Kinshasa');
      expect(maluku, isNotNull);
      expect(KinshasaLocation.isInBounds(maluku!), isTrue);
    });

    test('snaps GPS hors zone quand adresse mentionne Kinshasa', () {
      const abroad = LatLng(37.42, -122.08);
      final snapped = KinshasaLocation.ensureInKinshasa(
        abroad,
        address: 'Ma position, Kinshasa',
      );
      expect(KinshasaLocation.isInBounds(snapped), isTrue);
    });

    test('coordsFromAddress resolves commune name', () {
      final limete = KinshasaLocation.coordsFromAddress('Limete');
      expect(limete.latitude, closeTo(-4.3389, 0.001));
      expect(KinshasaLocation.isInBounds(limete), isTrue);
    });

    test('Butembo is in nationwide service area', () {
      expect(
        KinshasaLocation.destinationInServiceArea('Butembo'),
        isTrue,
      );
      expect(
        KinshasaLocation.destinationInServiceArea('Gombe'),
        isTrue,
      );
    });

    test('Paris is outside service area', () {
      expect(
        KinshasaLocation.destinationInServiceArea('Paris, France'),
        isFalse,
      );
    });

    test('ServiceAreas lists 26+ cities', () {
      expect(ServiceAreas.all.length, greaterThanOrEqualTo(26));
    });
  });
}
