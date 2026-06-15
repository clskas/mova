import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:mova/features/delivery/widgets/delivery_tracking_map.dart';

void main() {
  test('DeliveryTrackingMap.parseLocation reads lat/lng', () {
    final pos = DeliveryTrackingMap.parseLocation({'lat': -4.32, 'lng': 15.31});
    expect(pos, isNotNull);
    expect(pos!.latitude, -4.32);
    expect(pos.longitude, 15.31);
  });

  test('DeliveryTrackingMap.etaFromDelivery prefers API eta', () {
    final eta = DeliveryTrackingMap.etaFromDelivery({'etaMinutes': 12});
    expect(eta, 12);
  });

  test('DeliveryTrackingMap.etaFromDelivery computes from courier GPS', () {
    final eta = DeliveryTrackingMap.etaFromDelivery({
      'courierLocation': {'lat': -4.32, 'lng': 15.31},
      'dropoffLat': -4.33,
      'dropoffLng': 15.32,
    });
    expect(eta, greaterThanOrEqualTo(1));
  });
}
