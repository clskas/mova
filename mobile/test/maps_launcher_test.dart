import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/geo/maps_launcher.dart';

void main() {
  test('googleMapsDirectionsUri includes destination and travelmode', () {
    final uri = MapsLauncher.googleMapsDirectionsUri(
      destinationLat: -4.321,
      destinationLng: 15.312,
    );
    expect(uri.host, 'www.google.com');
    expect(uri.path, '/maps/dir/');
    expect(uri.queryParameters['destination'], '-4.321,15.312');
    expect(uri.queryParameters['travelmode'], 'driving');
    expect(uri.queryParameters.containsKey('origin'), isFalse);
  });

  test('googleMapsDirectionsUri includes origin when provided', () {
    final uri = MapsLauncher.googleMapsDirectionsUri(
      destinationLat: -4.33,
      destinationLng: 15.32,
      originLat: -4.32,
      originLng: 15.31,
    );
    expect(uri.queryParameters['origin'], '-4.32,15.31');
  });

  test('googleNavigationUri uses lat,lng query', () {
    final uri = MapsLauncher.googleNavigationUri(
      destinationLat: -4.321,
      destinationLng: 15.312,
    );
    expect(uri.toString(), contains('google.navigation:q=-4.321,15.312'));
  });
}
