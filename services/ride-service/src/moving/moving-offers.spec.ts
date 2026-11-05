import { MovingService } from './moving.service';
import { mockPlatformConfig } from '../platform/platform-config.mock';
import { fetchDriverProfileSnapshot, assertDriverEligibleForMoving } from '../common/driver-eligibility.util';
import { publishDriverJobAlert, publishDriverJobStop } from '../common/driver-job-alert.util';

jest.mock('../common/driver-eligibility.util', () => ({
  ...jest.requireActual('../common/driver-eligibility.util'),
  assertDriverEligibleForMoving: jest.fn().mockResolvedValue({}),
  fetchDriverProfileSnapshot: jest.fn(),
}));
jest.mock('../common/driver-debt.util', () => ({
  filterDriversNotDebtBlocked: jest.fn(async (ids: string[]) => ids),
}));
jest.mock('../common/driver-job-alert.util', () => ({
  publishDriverJobAlert: jest.fn().mockResolvedValue(undefined),
  publishDriverJobStop: jest.fn().mockResolvedValue(undefined),
}));

const KINSHASA = { lat: -4.32, lng: 15.31 };

function camion(volume: number | null) {
  return { id: 'v1', type: 'CAMION', isActive: true, cargoVolumeM3: volume };
}

describe('MovingService — offers to eligible drivers', () => {
  const prisma = {
    movingRequest: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };
  const redis = { publish: jest.fn().mockResolvedValue(undefined) };
  const matching = { findDrivers: jest.fn() };
  const commission = {
    get: jest.fn().mockResolvedValue({ platformPercent: 18 }),
    splitGross: jest.fn((gross: number) => ({ driverNetCdf: gross * 0.82 })),
  };
  const surcharges = { get: jest.fn().mockResolvedValue({ baseFeeCdf: 15000, multiplier: 1.5, perUnitCdf: 8000 }) };
  const movingVehiclePricing = { getMultiplier: jest.fn(), getLabel: jest.fn().mockResolvedValue('Camion ~30 m³') };

  const service = new MovingService(
    prisma as never,
    {} as never,
    surcharges as never,
    redis as never,
    { generateCompletionPin: jest.fn().mockReturnValue('4321') } as never,
    {} as never,
    {} as never,
    commission as never,
    movingVehiclePricing as never,
    mockPlatformConfig(),
    matching as never,
  );

  const openMove = {
    id: 'm1',
    userId: 'client-1',
    status: 'PENDING',
    driverId: null,
    vehicleCategory: 'CAMION_30M3',
    volumeM3: 26,
    pickupLat: KINSHASA.lat,
    pickupLng: KINSHASA.lng,
    pickupAddress: 'Gombe',
    dropoffAddress: 'Limete',
    estimatedPriceCdf: 300000,
    completionPin: null,
    completedAt: null,
    photoUrls: null,
    createdAt: new Date(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('alerts only nearby drivers whose camion holds the move', async () => {
    matching.findDrivers.mockResolvedValue([{ userId: 'big' }, { userId: 'small' }, { userId: 'unknown' }]);
    (fetchDriverProfileSnapshot as jest.Mock).mockImplementation(async (id: string) => ({
      vehicles: [camion(id === 'big' ? 30 : id === 'small' ? 15 : null)],
    }));
    await (service as unknown as { alertMovingOffer: (r: unknown) => Promise<void> }).alertMovingOffer(openMove);
    expect(matching.findDrivers).toHaveBeenCalledWith(KINSHASA.lat, KINSHASA.lng, 'CAMION', expect.any(Number));
    expect(publishDriverJobAlert).toHaveBeenCalledWith(
      redis,
      expect.objectContaining({ jobKind: 'MISSION', referenceId: 'm1', driverUserIds: ['big', 'unknown'] }),
    );
  });

  it('sends no alert when no driver fits', async () => {
    matching.findDrivers.mockResolvedValue([{ userId: 'small' }]);
    (fetchDriverProfileSnapshot as jest.Mock).mockResolvedValue({ vehicles: [camion(15)] });
    await (service as unknown as { alertMovingOffer: (r: unknown) => Promise<void> }).alertMovingOffer(openMove);
    expect(publishDriverJobAlert).not.toHaveBeenCalled();
  });

  it('lists the open moves that fit the driver, with the net gain', async () => {
    (fetchDriverProfileSnapshot as jest.Mock).mockResolvedValue({ vehicles: [camion(20)], operatingCity: null });
    prisma.movingRequest.findMany.mockResolvedValue([openMove, { ...openMove, id: 'm2', volumeM3: 18 }]);
    const { data } = await service.listOffersForDriver('driver-1');
    expect(data.map((o) => o.id)).toEqual(['m2']);
    expect(data[0].driverNetCdf).toBe(246000);
  });

  it('offers nothing to a driver without utilitaire or camion', async () => {
    (fetchDriverProfileSnapshot as jest.Mock).mockResolvedValue({ vehicles: [{ id: 'v', type: 'VIP' }] });
    const { data } = await service.listOffersForDriver('driver-1');
    expect(data).toEqual([]);
    expect(prisma.movingRequest.findMany).not.toHaveBeenCalled();
  });

  it('assigns the first driver who accepts and stops the offer for the others', async () => {
    prisma.movingRequest.findUnique.mockResolvedValue(openMove);
    prisma.movingRequest.update.mockResolvedValue({ ...openMove, driverId: 'driver-1', status: 'ASSIGNED' });
    const result = await service.acceptByDriver('m1', 'driver-1');
    expect(assertDriverEligibleForMoving).toHaveBeenCalledWith('driver-1', 'CAMION_30M3', 26);
    expect(prisma.movingRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1', driverId: null, status: 'PENDING' } }),
    );
    expect(result.moving.status).toBe('ASSIGNED');
    expect(publishDriverJobStop).toHaveBeenCalledWith(
      redis,
      expect.objectContaining({ referenceId: 'm1', reason: 'taken', excludeUserIds: ['driver-1'] }),
    );
  });

  it('refuses a move already taken', async () => {
    prisma.movingRequest.findUnique.mockResolvedValue({ ...openMove, driverId: 'other', status: 'ASSIGNED' });
    await expect(service.acceptByDriver('m1', 'driver-1')).rejects.toThrow();
    expect(prisma.movingRequest.update).not.toHaveBeenCalled();
  });

  it('loses the race cleanly when another driver accepted first', async () => {
    prisma.movingRequest.findUnique.mockResolvedValue(openMove);
    prisma.movingRequest.update.mockRejectedValue({ code: 'P2025' });
    await expect(service.acceptByDriver('m1', 'driver-1')).rejects.toThrow(/déjà été pris/);
  });
});
