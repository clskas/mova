import { HubPaymentsService } from './hub-payments.service';

describe('HubPaymentsService.finalizeFromAggregator amount check', () => {
  const apps = { get: () => null };
  const config = { get: () => undefined };
  const prisma = {
    hubPayment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const service = new HubPaymentsService(
    prisma as never,
    config as never,
    apps as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(service, 'notifyApp').mockResolvedValue(false);
  });

  it('marks FAILED when paid amount ≠ expected (underpay)', async () => {
    prisma.hubPayment.findFirst.mockResolvedValue({
      id: 'hub-1',
      reference: 'senga_pay_ride1',
      amountCdf: 8500,
      purpose: 'pay',
      status: 'PENDING',
      completedAt: null,
      notifiedAt: null,
      providerRef: 'SD1',
    });
    prisma.hubPayment.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.finalizeFromAggregator('SD1', 'COMPLETED', undefined, 5000);

    expect(result).toMatchObject({ found: true, status: 'FAILED' });
    expect(prisma.hubPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: expect.stringContaining('insuffisant'),
        }),
      }),
    );
  });

  it('marks FAILED when paid amount ≠ expected (overpay, fail-closed)', async () => {
    prisma.hubPayment.findFirst.mockResolvedValue({
      id: 'hub-2',
      reference: 'senga_pay_ride2',
      amountCdf: 8500,
      purpose: 'pay',
      status: 'PENDING',
      completedAt: null,
      notifiedAt: null,
      providerRef: 'SD2',
    });
    prisma.hubPayment.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.finalizeFromAggregator('SD2', 'COMPLETED', undefined, 9000);

    expect(result).toMatchObject({ found: true, status: 'FAILED' });
    expect(prisma.hubPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: expect.stringContaining('supérieur'),
        }),
      }),
    );
  });

  it('completes when confirmed amount matches', async () => {
    prisma.hubPayment.findFirst.mockResolvedValue({
      id: 'hub-3',
      reference: 'senga_pay_ride3',
      amountCdf: 8500,
      purpose: 'pay',
      status: 'PENDING',
      completedAt: null,
      notifiedAt: null,
      providerRef: 'SD3',
    });
    prisma.hubPayment.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.finalizeFromAggregator('SD3', 'COMPLETED', undefined, 8500);

    expect(result).toMatchObject({ found: true, status: 'COMPLETED' });
    expect(prisma.hubPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', failureReason: null }),
      }),
    );
  });
});
