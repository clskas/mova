import { TestCleanupService } from './test-cleanup.service';

describe('TestCleanupService', () => {
  const at = (iso: string) => new Date(iso);
  const prisma = {
    ride: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'r-short', createdAt: at('2026-11-01T10:00:00Z'), acceptedAt: null, startedAt: at('2026-11-01T10:01:00Z'), completedAt: at('2026-11-01T10:03:00Z'), passengerId: 'p', driverId: 'd', finalFareCdf: 5000, estimatedFareCdf: 5000, pickupAddress: 'A', dropoffAddress: 'B', sharePassengers: [] },
        { id: 'r-real', createdAt: at('2026-11-01T11:00:00Z'), acceptedAt: null, startedAt: at('2026-11-01T11:00:00Z'), completedAt: at('2026-11-01T11:20:00Z'), passengerId: 'p', driverId: 'd', finalFareCdf: 9000, estimatedFareCdf: 9000, pickupAddress: 'A', dropoffAddress: 'C', sharePassengers: [] },
      ]),
      update: jest.fn(),
    },
    delivery: { findMany: jest.fn().mockResolvedValue([]) },
    errandOrder: { findMany: jest.fn().mockResolvedValue([]) },
    movingRequest: { findMany: jest.fn().mockResolvedValue([]) },
    rentalInquiry: { findMany: jest.fn().mockResolvedValue([]) },
    carpoolTrip: { findMany: jest.fn().mockResolvedValue([]) },
    scheduledRide: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new TestCleanupService(prisma as never);

  it('refuses to run without a date or test accounts', async () => {
    await expect(service.select({})).rejects.toThrow('date limite ou des comptes');
  });

  it('keeps only items shorter than the threshold', async () => {
    const items = await service.select({ before: '2026-11-05' });
    expect(items.map((i) => i.id)).toEqual(['r-short']);
    expect(items[0]!.durationMin).toBe(2);
  });

  it('apply only touches the keys the admin reviewed', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    global.fetch = fetchMock as never;
    const res = await service.apply({ before: '2026-11-05' }, ['RIDE:someone-else']);
    expect(res.count).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.ride.update).not.toHaveBeenCalled();
  });

  it('also finds scheduled rides, timed on their linked ride', async () => {
    prisma.scheduledRide.findMany.mockResolvedValueOnce([
      { id: 's-short', createdAt: at('2026-10-30T08:00:00Z'), rideId: 'r-short', passengerId: 'p', driverId: 'd', estimatedPriceCdf: 7000, pickupAddress: 'A', dropoffAddress: 'B' },
      { id: 's-real', createdAt: at('2026-10-30T09:00:00Z'), rideId: 'r-real', passengerId: 'p', driverId: 'd', estimatedPriceCdf: 9000, pickupAddress: 'A', dropoffAddress: 'C' },
    ]);
    const items = await service.select({ before: '2026-11-05' });
    const scheduled = items.filter((i) => i.type === 'SCHEDULED');
    expect(scheduled.map((i) => i.id)).toEqual(['s-short']);
    expect(scheduled[0]!.extraIds).toEqual(['r-short']);
    expect(scheduled[0]!.durationMin).toBe(2);
  });

  it('cancelled requests only with the option, then only marked as tests', async () => {
    const cancelled = [{ id: 'r-cancel', createdAt: at('2026-11-01T09:00:00Z'), passengerId: 'p', driverId: null, cancellationFeeCdf: null, pickupAddress: 'A', dropoffAddress: 'B' }];
    const svc = new TestCleanupService({
      ...prisma,
      ride: { ...prisma.ride, findMany: jest.fn().mockImplementation((q: { where: { status: string } }) => Promise.resolve(q.where.status === 'CANCELLED' ? cancelled : [])), update: jest.fn() },
      delivery: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      errandOrder: { findMany: jest.fn().mockResolvedValue([]) },
      movingRequest: { findMany: jest.fn().mockResolvedValue([]) },
      scheduledRide: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);
    expect((await svc.select({ before: '2026-11-05' })).map((i) => i.id)).toEqual([]);
    const items = await svc.select({ before: '2026-11-05', includeCancelled: true });
    expect(items.map((i) => [i.id, i.cancelled])).toEqual([['r-cancel', true]]);
  });

  it('any duration only when test accounts are listed', async () => {
    expect((await service.select({ before: '2026-11-05', anyDuration: true })).map((i) => i.id)).toEqual(['r-short']);
    const items = await service.select({ userIds: ['p'], anyDuration: true });
    expect(items.map((i) => i.id)).toEqual(['r-short', 'r-real']);
  });
});
