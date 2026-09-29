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
