import { DriverHistoryService } from './driver-history.service';

function setup(data: Record<string, unknown[]>) {
  const model = (rows: unknown[] = []) => ({ findMany: jest.fn().mockResolvedValue(rows) });
  const prisma = {
    delivery: model(data.delivery),
    errandOrder: model(data.errandOrder),
    movingRequest: model(data.movingRequest),
    scheduledRide: model(data.scheduledRide),
    rentalInquiry: model(data.rentalInquiry),
    carpoolTrip: model(data.carpoolTrip),
  };
  const commission = {
    get: jest.fn().mockResolvedValue({ platformPercent: 20 }),
    splitGross: (gross: number, pct: number) => {
      const fee = Math.ceil(gross * (pct / 100));
      return { grossCdf: gross, platformFeeCdf: fee, driverNetCdf: gross - fee, platformPercent: pct };
    },
  };
  return { svc: new DriverHistoryService(prisma as never, commission as never), prisma };
}

describe('DriverHistoryService', () => {
  it('lists every mission type, newest first, with the driver net', async () => {
    const { svc } = setup({
      delivery: [
        { id: 'd1', type: 'PARCEL', status: 'DELIVERED', createdAt: new Date('2026-11-05T10:00:00Z'), estimatedPriceCdf: 10000, finalPriceCdf: null, events: [], items: null, pickupAddress: 'A', dropoffAddress: 'B' },
      ],
      movingRequest: [
        { id: 'm1', status: 'COMPLETED', createdAt: new Date('2026-11-06T10:00:00Z'), estimatedPriceCdf: 50000, pickupAddress: 'C', dropoffAddress: 'D' },
      ],
    });
    const res = await svc.list('drv1');
    expect(res.data.map((i) => i.id)).toEqual(['m1', 'd1']);
    expect(res.data[1]).toMatchObject({ type: 'PARCEL', driverGrossCdf: 10000, platformFeeCdf: 2000, driverNetCdf: 8000, commissionPercent: 20 });
  });

  it('counts only the delivery fee for food orders', async () => {
    const { svc } = setup({
      delivery: [
        {
          id: 'f1',
          type: 'FOOD',
          status: 'DELIVERED',
          createdAt: new Date(),
          estimatedPriceCdf: 30000,
          finalPriceCdf: null,
          restaurant: { name: 'Chez Flore' },
          events: [{ event: 'ORDER_PLACED', metadata: { deliveryFeeCdf: 4000 } }],
          items: [],
        },
      ],
    });
    const res = await svc.list('drv1');
    expect(res.data[0]).toMatchObject({ title: 'Chez Flore', driverGrossCdf: 4000 });
  });

  it('pages with before and only for this driver', async () => {
    const before = new Date('2026-11-01T00:00:00Z');
    const { svc, prisma } = setup({});
    await svc.list('drv1', 20, before);
    expect(prisma.delivery.findMany.mock.calls[0][0].where).toEqual({ driverId: 'drv1', createdAt: { lt: before } });
    expect(prisma.delivery.findMany.mock.calls[0][0].take).toBe(20);
  });
});
