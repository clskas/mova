import { CashDebtCategory, CashDebtStatus } from '@prisma/client';
import { DriverDebtLedgerService } from './driver-debt-ledger.service';

describe('DriverDebtLedgerService.settleAvailableFromWallet', () => {
  const prisma = {
    driverCashDebt: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    walletTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const wallet = {
    getWallet: jest.fn().mockResolvedValue({
      balanceCdf: 3000,
      heldBalanceCdf: 0,
      availableBalanceCdf: 3000,
    }),
    debit: jest.fn().mockResolvedValue({ balanceCdf: 0 }),
    credit: jest.fn(),
    creditPlatformFee: jest.fn().mockResolvedValue(null),
  };

  const service = new DriverDebtLedgerService(prisma as never, wallet as never);

  beforeEach(() => {
    jest.clearAllMocks();
    wallet.getWallet.mockResolvedValue({
      balanceCdf: 3000,
      heldBalanceCdf: 0,
      availableBalanceCdf: 3000,
    });
    wallet.debit.mockResolvedValue({ balanceCdf: 0 });
  });

  it('applique le top-up partiellement sur une dette plus grande', async () => {
    prisma.driverCashDebt.findMany.mockResolvedValue([
      {
        id: 'debt-1',
        driverUserId: 'driver-1',
        referenceType: 'RIDE',
        referenceId: 'old-ride',
        category: CashDebtCategory.PLATFORM_FEE,
        amountCdf: 8000,
        status: CashDebtStatus.OPEN,
        beneficiaryUserId: null,
        description: 'Commission',
        createdAt: new Date(),
      },
    ]);
    prisma.driverCashDebt.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'debt-1',
      ...data,
      category: CashDebtCategory.PLATFORM_FEE,
      referenceType: 'RIDE',
      referenceId: 'old-ride',
      amountCdf: typeof data.amountCdf === 'number' ? data.amountCdf : 5000,
      beneficiaryUserId: null,
    }));

    const result = await service.settleAvailableFromWallet('driver-1');
    expect(result.settled).toBe(true);
    expect(result.amountCdf).toBe(3000);
    expect(wallet.debit).toHaveBeenCalledWith(
      'driver-1',
      3000,
      expect.stringContaining('Règlement dette'),
      expect.stringContaining('CASH_DEBT_PARTIAL'),
    );
    expect(prisma.driverCashDebt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'debt-1' },
        data: expect.objectContaining({ amountCdf: 5000 }),
      }),
    );
  });

  it('solde une dette entièrement si top-up ≥ dette', async () => {
    wallet.getWallet.mockResolvedValue({
      balanceCdf: 5000,
      heldBalanceCdf: 0,
      availableBalanceCdf: 5000,
    });
    prisma.driverCashDebt.findMany.mockResolvedValue([
      {
        id: 'debt-2',
        driverUserId: 'driver-1',
        referenceType: 'RIDE',
        referenceId: 'old-ride',
        category: CashDebtCategory.PLATFORM_FEE,
        amountCdf: 2000,
        status: CashDebtStatus.OPEN,
        beneficiaryUserId: null,
        description: null,
        createdAt: new Date(),
      },
    ]);
    prisma.driverCashDebt.update.mockResolvedValue({
      id: 'debt-2',
      category: CashDebtCategory.PLATFORM_FEE,
      referenceType: 'RIDE',
      referenceId: 'old-ride',
      amountCdf: 2000,
      beneficiaryUserId: null,
      status: CashDebtStatus.SETTLED,
    });

    const result = await service.settleAvailableFromWallet('driver-1');
    expect(result.amountCdf).toBe(2000);
    expect(result.settledCount).toBe(1);
    expect(prisma.driverCashDebt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: CashDebtStatus.SETTLED }),
      }),
    );
  });
});

describe('DriverDebtLedgerService — settlement holes (audit 2026-11)', () => {
  const debt = (id: string, amountCdf: number, createdAt = new Date('2026-11-01T10:00:00Z')) => ({
    id,
    driverUserId: 'driver-1',
    referenceType: 'RIDE',
    referenceId: `ride-${id}`,
    category: CashDebtCategory.PLATFORM_FEE,
    amountCdf,
    status: CashDebtStatus.OPEN,
    beneficiaryUserId: null,
    description: 'Commission',
    createdAt,
  });
  const prisma = {
    driverCashDebt: { findMany: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    driverCashDebtCashRequest: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    walletTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const wallet = {
    debit: jest.fn().mockResolvedValue({ balanceCdf: 0 }),
    credit: jest.fn(),
    creditPlatformFee: jest.fn().mockResolvedValue(null),
  };
  const service = new DriverDebtLedgerService(prisma as never, wallet as never);

  beforeEach(() => jest.clearAllMocks());

  it('debits the same set of debts once (same reference on a double tap)', async () => {
    prisma.driverCashDebt.findMany.mockResolvedValue([debt('a', 1000), debt('b', 2000)]);
    await service.settleFromWallet('driver-1');
    prisma.driverCashDebt.findMany.mockResolvedValue([debt('b', 2000), debt('a', 1000)]);
    await service.settleFromWallet('driver-1');
    const refs = wallet.debit.mock.calls.map((c: unknown[]) => c[3]);
    expect(wallet.debit.mock.calls[0][1]).toBe(3000);
    expect(refs[0]).toBe(refs[1]);
    // only the debited debts are marked settled
    expect(prisma.driverCashDebt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['a', 'b'] }, status: CashDebtStatus.OPEN } }),
    );
  });

  it('the counter code settles only the debts known when the code was made', async () => {
    const codeAt = new Date('2026-11-02T10:00:00Z');
    prisma.driverCashDebtCashRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      driverUserId: 'driver-1',
      code: '123456',
      createdAt: codeAt,
    });
    prisma.driverCashDebtCashRequest.updateMany
      .mockResolvedValueOnce({ count: 0 }) // expireStaleCashRequests
      .mockResolvedValueOnce({ count: 1 }); // claim
    prisma.driverCashDebt.findMany.mockResolvedValue([debt('old', 10000)]);
    const result = await service.confirmCashPaymentRequest('123456', 'agent-1');
    expect(result).toMatchObject({ confirmed: true, amountCdf: 10000 });
    expect(prisma.driverCashDebt.findMany).toHaveBeenCalledWith({
      where: { driverUserId: 'driver-1', status: CashDebtStatus.OPEN, createdAt: { lte: codeAt } },
    });
    expect(prisma.driverCashDebt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['old'] }, status: CashDebtStatus.OPEN } }),
    );
  });

  it('a code cannot be confirmed twice', async () => {
    prisma.driverCashDebtCashRequest.findFirst.mockResolvedValue({
      id: 'req-2',
      driverUserId: 'driver-1',
      code: '654321',
      createdAt: new Date(),
    });
    prisma.driverCashDebtCashRequest.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.driverCashDebt.findMany.mockResolvedValue([debt('x', 5000)]);
    const result = await service.confirmCashPaymentRequest('654321');
    expect(result).toMatchObject({ confirmed: false });
    expect(prisma.driverCashDebt.updateMany).not.toHaveBeenCalled();
  });
});
