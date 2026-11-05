import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/config/client_apps_config.dart';

void main() {
  test('only utilitaire and camion have a cargo volume', () {
    expect(cargoVolumeRange('UTILITAIRE'), (min: 1, max: 25));
    expect(cargoVolumeRange('CAMION'), (min: 5, max: 100));
    expect(cargoVolumeRange('STANDARD'), isNull);
    expect(cargoVolumeRange('MOTO_TAXI'), isNull);
  });

  test('volume is required and range-checked for cargo vehicles', () {
    expect(validateCargoVolume('CAMION', ''), isNotNull);
    expect(validateCargoVolume('CAMION', '4'), isNotNull);
    expect(validateCargoVolume('CAMION', '30'), isNull);
    expect(validateCargoVolume('UTILITAIRE', '26'), isNotNull);
    expect(validateCargoVolume('UTILITAIRE', '12'), isNull);
    expect(validateCargoVolume('STANDARD', ''), isNull);
  });
}
