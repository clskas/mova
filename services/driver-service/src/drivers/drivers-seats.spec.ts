import { KycStatus, VehicleType } from '@prisma/client';
import { DriversService } from './drivers.service';

describe('DriversService — places passagers', () => {
  const prisma = {
    driverProfile: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    vehicle: { update: jest.fn() },
  };
  const matchingConfig = {
    get: () => ({
      initialRadiusKm: 5,
      radiusIncrementKm: 2,
      maxRadiusKm: 15,
      scoreWeights: { proximity: 0.4, rating: 0.3, acceptanceRate: 0.2, seniority: 0.1 },
    }),
  };
  const service = new DriversService(prisma as never, {} as never, matchingConfig as never);
  // Documents are checked elsewhere; keep the focus on seats.
  (service as unknown as { documentsStatusFor: () => { canOperate: boolean } }).documentsStatusFor = () => ({
    canOperate: true,
  });

  const driver = (userId: string, passengerSeats: number | null) => ({
    id: `profile-${userId}`,
    userId,
    currentLat: -4.32,
    currentLng: 15.31,
    operatingCity: 'Kinshasa',
    ratingAvg: 4.8,
    totalRides: 10,
    vehicles: [{ id: `v-${userId}`, type: VehicleType.STANDARD, passengerSeats }],
  });

  beforeEach(() => jest.clearAllMocks());

  it('keeps only vehicles with enough seats for the group', async () => {
    prisma.driverProfile.findMany.mockResolvedValue([driver('small', 3), driver('default', null), driver('van', 7)]);
    const one = await service.findNearby(-4.32, 15.31, VehicleType.STANDARD, 0, 'Kinshasa');
    expect(one.map((d) => d.userId).sort()).toEqual(['default', 'small', 'van']);
    const four = await service.findNearby(-4.32, 15.31, VehicleType.STANDARD, 0, 'Kinshasa', { minSeats: 4 });
    expect(four.map((d) => d.userId).sort()).toEqual(['default', 'van']);
    const six = await service.findNearby(-4.32, 15.31, VehicleType.STANDARD, 0, 'Kinshasa', { minSeats: 6 });
    expect(six.map((d) => d.userId)).toEqual(['van']);
  });

  it('lets admin set and reset the seats of the active vehicle', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue({
      vehicles: [{ id: 'v1', type: VehicleType.STANDARD, isActive: true, typeApprovalStatus: KycStatus.APPROVED }],
    });
    await expect(service.setVehiclePassengerSeats('u1', 7)).resolves.toMatchObject({ passengerSeats: 7 });
    expect(prisma.vehicle.update).toHaveBeenLastCalledWith({ where: { id: 'v1' }, data: { passengerSeats: 7 } });
    await expect(service.setVehiclePassengerSeats('u1', null)).resolves.toMatchObject({
      passengerSeats: 4,
      passengerSeatsDeclared: false,
    });
    await expect(service.setVehiclePassengerSeats('u1', 12)).rejects.toBeDefined();
  });

  it('refuses more than one passenger seat on a moto', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue({
      vehicles: [{ id: 'v1', type: VehicleType.MOTO_TAXI, isActive: true }],
    });
    await expect(service.setVehiclePassengerSeats('u1', 2)).rejects.toBeDefined();
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });
});
