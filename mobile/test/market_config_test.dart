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

    test('normalise Taxi / Moto et alias courants', () {
      expect(MarketConfig.normalizeVehicleType('TAXI'), 'STANDARD');
      expect(MarketConfig.normalizeVehicleType('moto-taxi'), 'MOTO_TAXI');
      expect(MarketConfig.normalizeVehicleType('BIKE'), 'MOTO_TAXI');
      expect(MarketConfig.normalizeVehicleType('BERLINE'), 'STANDARD');
      expect(MarketConfig.normalizeVehicleType('CAR'), 'STANDARD');
      expect(MarketConfig.vehicleCategory('MOTO'), 'MOTO');
      expect(MarketConfig.vehicleCategory('TAXI'), 'TAXI');
      expect(MarketConfig.vehicleCategory('CONFORT'), 'TAXI');
      expect(MarketConfig.defaultTypeForCategory('MOTO'), 'MOTO_TAXI');
      expect(MarketConfig.defaultTypeForCategory('TAXI'), 'STANDARD');
      expect(MarketConfig.vehicleTypesForCategory('MOTO').map((v) => v.id), ['MOTO_TAXI']);
      expect(MarketConfig.vehicleTypesForCategory('TAXI').map((v) => v.id), ['STANDARD', 'COMFORT', 'VIP']);
    });

    test('matching chauffeur : moto exclusive, taxi compatible par gamme', () {
      expect(MarketConfig.driverVehicleTypesForRide('MOTO'), ['MOTO_TAXI']);
      expect(MarketConfig.driverVehicleTypesForRide('TAXI'), ['STANDARD', 'COMFORT', 'VIP']);
      expect(MarketConfig.driverVehicleTypesForRide('CONFORT'), ['COMFORT', 'VIP']);
    });
  });
}
