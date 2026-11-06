import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/config/client_apps_config.dart';
import 'package:mova/core/config/market_config.dart';

void main() {
  test('Tricycle gamme stays hidden until the admin switch is on', () {
    final hidden = MarketConfig.vehicleTypesForCategory('TAXI').map((v) => v.id);
    expect(hidden, isNot(contains('TRICYCLE')));
    final shown = MarketConfig.vehicleTypesForCategory('TAXI', includeTricycle: true).map((v) => v.id);
    expect(shown, contains('TRICYCLE'));
    expect(MarketConfig.bookableVehicleTypes().map((v) => v.id), isNot(contains('TRICYCLE')));
    expect(tricycleFeatureEnabled({'tricycleEnabled': true}), isTrue);
    expect(tricycleFeatureEnabled({}), isFalse);
  });

  test('local names map to the right vehicle', () {
    expect(MarketConfig.normalizeVehicleType('keke'), 'TRICYCLE');
    expect(MarketConfig.normalizeVehicleType('Tripoteur'), 'TRIPOTEUR');
    expect(MarketConfig.driverVehicleTypesForRide('TRICYCLE'), ['TRICYCLE']);
  });

  test('tricycle seats 1-3, tripoteur declares a 1-4 m³ volume', () {
    expect(declarableSeats('TRICYCLE'), [1, 2, 3]);
    expect(defaultPassengerSeats('TRICYCLE'), 3);
    expect(cargoVolumeRange('TRIPOTEUR'), (min: 1, max: 4));
    expect(validateCargoVolume('TRIPOTEUR', '5'), isNotNull);
    expect(validateCargoVolume('TRIPOTEUR', '3'), isNull);
    expect(kTricyclePassengerLimit, 3);
  });
}
