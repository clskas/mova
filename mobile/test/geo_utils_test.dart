import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/geo/geo_utils.dart';

void main() {
  test('haversineKm returns positive distance', () {
    final km = GeoUtils.haversineKm(-4.32, 15.31, -4.33, 15.32);
    expect(km, greaterThan(0));
    expect(km, lessThan(5));
  });

  test('etaMinutesFromDistanceKm uses 25 km/h urban speed', () {
    expect(GeoUtils.etaMinutesFromDistanceKm(2.5), 6);
    expect(GeoUtils.etaMinutesFromDistanceKm(0.1), 1);
  });

  test('formatDistanceKm uses meters below 1 km', () {
    expect(GeoUtils.formatDistanceKm(0.45), '450 m');
    expect(GeoUtils.formatDistanceKm(0.999), '999 m');
    expect(GeoUtils.formatDistanceKm(1.2), '1.2 km');
  });

  test('driverEtaMinutes computes pickup ETA', () {
    final eta = GeoUtils.driverEtaMinutes(-4.32, 15.31, -4.33, 15.32);
    expect(eta, greaterThanOrEqualTo(1));
  });
}
