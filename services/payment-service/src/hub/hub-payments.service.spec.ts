import { HubPaymentsService } from './hub-payments.service';

describe('HubPaymentsService.finalizeFromAggregator amount check', () => {
  const apps = { get: () => null };
  const config = { get: () => undefined };
  const prisma = {
    hubPayment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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

  it('completes C2B when paid is intended + small operator fee (2366 vs 2300)', async () => {
    prisma.hubPayment.findFirst.mockResolvedValue({
      id: 'hub-fee',
      reference: 'senga_topup_1',
      amountCdf: 2300,
      purpose: 'topup',
      status: 'PENDING',
      completedAt: null,
      notifiedAt: null,
      providerRef: 'sp_SD2609053C7J9',
    });
    prisma.hubPayment.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.finalizeFromAggregator('SD2609053C7J9', 'COMPLETED', undefined, 2366);

    expect(result).toMatchObject({ found: true, status: 'COMPLETED' });
    expect(prisma.hubPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', failureReason: null }),
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

describe('HubPaymentsService.create — réserve avant agrégateur', () => {
  const apps = { get: () => null, isEnabled: () => true };
  const config = { get: jest.fn(() => undefined) };
  const prisma = {
    hubPayment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const service = new HubPaymentsService(prisma as never, config as never, apps as never);

  const dto = {
    app_id: 'senga',
    amount_cdf: 2300,
    currency: 'CDF',
    phone: '+243970000001',
    telecom: 'MP',
    reference: 'senga_topup_unique_1',
    purpose: 'topup',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.hubPayment.findFirst.mockResolvedValue(null);
    prisma.hubPayment.findUnique.mockResolvedValue(null);
  });

  it('réserve la ligne hub avant l’appel agrégateur (échec config → FAILED, pas de 2e C2B)', async () => {
    prisma.hubPayment.create.mockResolvedValue({
      id: 'pay_reserved',
      appId: 'senga',
      reference: dto.reference,
      status: 'PENDING',
      providerRef: 'pay_reserved',
      amountCdf: 2300,
      telecom: 'MP',
      completedAt: null,
      failureReason: null,
    });
    prisma.hubPayment.update.mockResolvedValue({});

    await expect(service.createCollect('senga', dto)).rejects.toMatchObject({
      response: { code: 'HUB_GATEWAY' },
    });
    expect(prisma.hubPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reference: dto.reference,
          status: 'PENDING',
          amountCdf: 2300,
        }),
      }),
    );
    expect(prisma.hubPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay_reserved' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('conflit unique (retry concurrent) : renvoie l’existant sans 2e C2B', async () => {
    prisma.hubPayment.create.mockRejectedValue({ code: 'P2002' });
    prisma.hubPayment.findUnique.mockResolvedValue({
      id: 'pay_existing',
      appId: 'senga',
      reference: dto.reference,
      status: 'PENDING',
      providerRef: 'pay_existing',
      amountCdf: 2300,
      telecom: 'MP',
      completedAt: null,
      failureReason: null,
    });

    const result = await service.createCollect('senga', dto);
    expect(result.statusCode).toBe(200);
    expect(result.body.payment_id).toBe('pay_existing');
    expect(prisma.hubPayment.update).not.toHaveBeenCalled();
  });
});
