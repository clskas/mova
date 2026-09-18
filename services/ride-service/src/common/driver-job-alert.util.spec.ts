import { VehicleType } from '@mova/shared';
import { notifyNearbyDrivers } from './driver-job-alert.util';

jest.mock('./driver-debt.util', () => ({
  filterDriversNotDebtBlocked: jest.fn(async (ids: string[]) => ids),
}));

jest.mock('./driver-eligibility.util', () => ({
  filterDriversAcceptingDeliveries: jest.fn(async (ids: string[]) =>
    ids.filter((id) => id !== 'ride-only'),
  ),
}));

describe('notifyNearbyDrivers', () => {
  const redis = { publish: jest.fn() };
  const matching = {
    findDrivers: jest.fn(async () => [
      { userId: 'livreur', driverId: 'd1', lat: 0, lng: 0, rating: 5, distanceKm: 1, score: 1 },
      { userId: 'ride-only', driverId: 'd2', lat: 0, lng: 0, rating: 5, distanceKm: 1, score: 1 },
    ]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes DELIVERY_OFFER only to livreurs (not ride-only)', async () => {
    await notifyNearbyDrivers(redis as never, matching as never, {
      jobKind: 'DELIVERY_OFFER',
      referenceId: 'del-1',
      pickupLat: -4.3,
      pickupLng: 15.3,
      title: 'Livraison',
      body: 'Offre',
      vehicleTypes: [VehicleType.MOTO_TAXI],
    });

    expect(matching.findDrivers).toHaveBeenCalledWith(-4.3, 15.3, VehicleType.MOTO_TAXI, 0, {
      forDelivery: true,
    });
    expect(redis.publish).toHaveBeenCalledWith(
      'driver.job.alert',
      expect.objectContaining({
        jobKind: 'DELIVERY_OFFER',
        driverUserIds: ['livreur'],
      }),
    );
  });
});
