import { TrackingReferenceType } from '@prisma/client';
import { MovaHttpException } from '@mova/shared';
import { TrackingService } from './tracking.service';

describe('TrackingService', () => {
  const prisma = {
    trackingPoint: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    ride: { findUnique: jest.fn() },
    delivery: { findUnique: jest.fn() },
    errandOrder: { findUnique: jest.fn() },
    movingRequest: { findUnique: jest.fn() },
    rentalInquiry: { findUnique: jest.fn() },
    restaurant: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new TrackingService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('skips duplicate nearby points', async () => {
    prisma.trackingPoint.findFirst.mockResolvedValue({
      lat: -4.32,
      lng: 15.31,
      recordedAt: new Date(),
    });
    const result = await service.recordPoint(TrackingReferenceType.RIDE, 'ride-1', -4.32001, 15.31001);
    expect(result.recorded).toBe(false);
    expect(prisma.trackingPoint.create).not.toHaveBeenCalled();
  });

  it('stores a new gps point', async () => {
    prisma.trackingPoint.findFirst.mockResolvedValue(null);
    prisma.trackingPoint.create.mockResolvedValue({
      lat: -4.33,
      lng: 15.32,
      recordedAt: new Date('2026-06-20T12:00:00Z'),
    });
    const result = await service.recordPoint(TrackingReferenceType.DELIVERY, 'd1', -4.33, 15.32);
    expect(result.recorded).toBe(true);
    expect(prisma.trackingPoint.create).toHaveBeenCalled();
  });

  it('allows ride passenger and driver, denies strangers', async () => {
    prisma.ride.findUnique.mockResolvedValue({ passengerId: 'p1', driverId: 'd1' });
    await expect(service.userCanAccessReference(TrackingReferenceType.RIDE, 'ride-1', 'p1')).resolves.toBe(true);
    await expect(service.userCanAccessReference(TrackingReferenceType.RIDE, 'ride-1', 'd1')).resolves.toBe(true);
    await expect(service.userCanAccessReference(TrackingReferenceType.RIDE, 'ride-1', 'stranger')).resolves.toBe(false);
  });

  it('denies GPS access when the ride cannot be resolved', async () => {
    prisma.ride.findUnique.mockResolvedValue(null);
    await expect(service.assertUserCanAccess(TrackingReferenceType.RIDE, 'missing', 'p1')).rejects.toBeInstanceOf(
      MovaHttpException,
    );
  });

  it('allows delivery restaurant owner', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      userId: 'p1',
      driverId: 'd1',
      restaurantId: 'r1',
      items: [],
      restaurant: { ownerUserId: 'owner-1' },
    });
    await expect(service.isDeliveryParticipant('del-1', 'owner-1')).resolves.toBe(true);
    await expect(service.isDeliveryParticipant('del-1', 'stranger')).resolves.toBe(false);
  });

  it('joins courier room for errand or moving ids', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    prisma.errandOrder.findUnique.mockResolvedValue({ userId: 'p1', driverId: 'c1' });
    prisma.movingRequest.findUnique.mockResolvedValue(null);
    await expect(service.canJoinCourierRoom('errand-1', 'c1')).resolves.toBe(true);
    await expect(service.canJoinCourierRoom('errand-1', 'stranger')).resolves.toBe(false);
  });

  it('allows rental passenger, driver and vehicle owner', async () => {
    prisma.rentalInquiry.findUnique.mockResolvedValue({
      userId: 'p1',
      driverId: 'd1',
      vehicle: { ownerUserId: 'owner-1' },
    });
    await expect(service.isRentalParticipant('inq-1', 'p1')).resolves.toBe(true);
    await expect(service.isRentalParticipant('inq-1', 'owner-1')).resolves.toBe(true);
    await expect(service.isRentalParticipant('inq-1', 'stranger')).resolves.toBe(false);
  });
});
