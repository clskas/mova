import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/config/market_config.dart';

void main() {
  group('MarketConfig.apiVehicleType', () {
    test('mappe les alias mobile vers Prisma', () {
      expect(MarketConfig.apiVehicleType('MOTO'), 'MOTO_TAXI');
      expect(MarketConfig.apiVehicleType('CONFORT'), 'COMFORT');
      expect(MarketConfig.apiVehicleType('STANDARD'), 'STANDARD');
      expect(MarketConfig.apiVehicleType('VIP'), 'VIP');
      expect(MarketConfig.apiVehicleType('MOTO_TAXI'), 'MOTO_TAXI');
    });
  });
}
