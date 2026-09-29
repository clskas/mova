import { DriverPayoutService } from './driver-payout.service';

describe('DriverPayoutService cash promo top-up', () => {
  const prisma = {
    walletTransaction: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    payment: { findUnique: jest.fn() },
    servicePayment: { findUnique: jest.fn() },
    driverCashDebt: { findUnique: jest.fn() },
  };
  const wallet = {
    credit: jest.fn().mockResolvedValue({ balanceCdf: 3000 }),
    debit: jest.fn(),
    getWallet: jest.fn().mockResolvedValue({ balanceCdf: 3000, heldBalanceCdf: 0, availableBalanceCdf: 3000 }),
  };
  const debts = { recordDebt: jest.fn() };

  const service = new DriverPayoutService(prisma as never, wallet as never, debts as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.walletTransaction.findFirst.mockResolvedValue(null);
    wallet.credit.mockResolvedValue({ balanceCdf: 3000 });
  });

  it('crédite PROMO_TOPUP (pas *_PAYOUT) pour le manque cash', async () => {
    const result = await service.creditCashPromoTopUp('driver-1', {
      referenceType: 'RIDE',
      referenceId: 'ride-big',
      amountCdf: 3000,
    });
    expect(result).toMatchObject({ credited: true, amountCdf: 3000 });
    expect(wallet.credit).toHaveBeenCalledWith(
      'driver-1',
      3000,
      expect.stringContaining('Compensation promo'),
      'PROMO_TOPUP:RIDE:ride-big',
    );
  });

  it('sync espèces ne clawback pas un PROMO_TOPUP (réf. distincte)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{ referenceType: 'RIDE', referenceId: 'ride-big', driverNetCdf: 8000 }],
      }),
    }) as never;
    prisma.payment.findUnique.mockResolvedValue({
      status: 'COMPLETED',
      method: 'CASH',
      amountCdf: 5000,
    });
    // alreadyCredited(RIDE_PAYOUT:…) → false (seule PROMO_TOPUP existe)
    prisma.walletTransaction.findFirst.mockResolvedValue(null);

    const sync = await service.syncDriverPayouts('driver-1');
    expect(wallet.debit).not.toHaveBeenCalled();
    expect(debts.recordDebt).not.toHaveBeenCalled();
    expect(sync.clawedBackCount).toBe(0);
  });
});
