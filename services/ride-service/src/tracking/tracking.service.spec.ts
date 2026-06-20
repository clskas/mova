import { TrackingReferenceType } from '@prisma/client';
import { TrackingService } from './tracking.service';

describe('TrackingService', () => {
  const prisma = {
    trackingPoint: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
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
});
