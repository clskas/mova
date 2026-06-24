import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:mova/core/location/service_area_gps.dart';

void main() {
  test('areaForCoords picks Kinshasa near Gombe', () {
    final area = ServiceAreaGps.areaForCoords(const LatLng(-4.3217, 15.3125));
    expect(area.name, 'Kinshasa');
  });

  test('areaForCoords picks nearest city outside box', () {
    final area = ServiceAreaGps.areaForCoords(const LatLng(-11.66, 27.48));
    expect(area.name, 'Lubumbashi');
  });
}
