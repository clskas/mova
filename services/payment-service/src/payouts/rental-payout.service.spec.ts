import { PaymentMethod } from '@prisma/client';
import { RentalPayoutService } from './rental-payout.service';

describe('RentalPayoutService', () => {
  const prisma = {
    walletTransaction: { findFirst: jest.fn() },
    servicePayment: { findUnique: jest.fn() },
  };
  const wallet = {
    credit: jest.fn(),
    creditPlatformFee: jest.fn(),
    recordPlatformPromoCost: jest.fn(),
  };
  const driverPayouts = {
    creditPayout: jest.fn(),
  };
  const debtLedger = {
    recordDebt: jest.fn(),
  };

  const service = new RentalPayoutService(
    prisma as never,
    wallet as never,
    driverPayouts as never,
    debtLedger as never,
  );

  const settlement = {
    referenceType: 'RENTAL',
    referenceId: 'book-1',
    ownerUserId: 'owner-1',
    partnerNetCdf: 8800,
    platformFeeCdf: 1200,
    subtotalGrossCdf: 10000,
    depositCdf: 50000,
    logistics: {
      driverId: 'drv-1',
      grossCdf: 4000,
      netCdf: 3520,
      platformFeeCdf: 480,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.walletTransaction.findFirst.mockResolvedValue(null);
    wallet.credit.mockResolvedValue({ balanceCdf: 8800 });
    wallet.creditPlatformFee.mockResolvedValue(null);
    driverPayouts.creditPayout.mockResolvedValue({ credited: true, amountCdf: 3520 });
    debtLedger.recordDebt.mockResolvedValue({});
    const prevFetch = global.fetch;
    (global as unknown as { fetch: typeof fetch }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => settlement,
    }) as unknown as typeof fetch;
    (service as unknown as { _prevFetch?: typeof fetch })._prevFetch = prevFetch;
  });

  afterEach(() => {
    const prev = (service as unknown as { _prevFetch?: typeof fetch })._prevFetch;
    if (prev) (global as unknown as { fetch: typeof fetch }).fetch = prev;
  });

  it('crédite propriétaire + commission + logistique (wallet)', async () => {
    const result = await service.creditRentalSettlement('book-1', PaymentMethod.WALLET);
    expect(result.handled).toBe(true);
    expect(wallet.credit).toHaveBeenCalledWith(
      'owner-1',
      8800,
      expect.stringContaining('Revenu location'),
      'RENTAL_OWNER:book-1',
    );
    expect(wallet.creditPlatformFee).toHaveBeenCalledWith(
      1200,
      expect.any(String),
      'PLATFORM_FEE:RENTAL:book-1',
    );
    expect(driverPayouts.creditPayout).toHaveBeenCalledWith('drv-1', {
      referenceType: 'RENTAL',
      referenceId: 'book-1',
      driverNetCdf: 3520,
    });
    expect(wallet.creditPlatformFee).toHaveBeenCalledWith(
      480,
      expect.any(String),
      'PLATFORM_FEE:RENTAL_LOGISTICS:book-1',
    );
    expect(debtLedger.recordDebt).not.toHaveBeenCalled();
  });

  it('espèces : pas de crédit wallet propriétaire ni trésorerie, dette commission', async () => {
    const result = await service.creditRentalSettlement('book-1', PaymentMethod.CASH);
    expect(result.handled).toBe(true);
    expect(wallet.credit).not.toHaveBeenCalled();
    expect(wallet.creditPlatformFee).not.toHaveBeenCalled();
    expect(driverPayouts.creditPayout).not.toHaveBeenCalled();
    expect(debtLedger.recordDebt).toHaveBeenCalledWith(
      expect.objectContaining({
        driverUserId: 'owner-1',
        category: 'PLATFORM_FEE',
        amountCdf: 1200,
      }),
    );
  });
});

describe('RentalPayoutService — deposit and SENGA promo (audit 2026-11)', () => {
  const prisma = { walletTransaction: { findFirst: jest.fn() }, servicePayment: { findUnique: jest.fn() } };
  const wallet = { credit: jest.fn(), creditPlatformFee: jest.fn(), recordPlatformPromoCost: jest.fn() };
  const service = new RentalPayoutService(prisma as never, wallet as never, { creditPayout: jest.fn() } as never, { recordDebt: jest.fn() } as never);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.walletTransaction.findFirst.mockResolvedValue(null);
    wallet.credit.mockResolvedValue({ balanceCdf: 0 });
  });

  it('refunds the deposit paid online, minus the part kept by the owner', async () => {
    prisma.servicePayment.findUnique.mockResolvedValue({ status: 'COMPLETED', method: PaymentMethod.WALLET, amountCdf: 150000 });
    const r = await service.settleDeposit('b1', { customerUserId: 'c1', ownerUserId: 'o1', depositCdf: 50000, retainedCdf: 20000 });
    expect(r).toMatchObject({ moved: true, refundCdf: 30000, retainedCdf: 20000 });
    expect(wallet.credit).toHaveBeenCalledWith('c1', 30000, expect.any(String), 'RENTAL_DEPOSIT_REFUND:b1');
    expect(wallet.credit).toHaveBeenCalledWith('o1', 20000, expect.any(String), 'RENTAL_DEPOSIT_RETAINED:b1');
  });

  it('moves nothing for a deposit paid in cash', async () => {
    prisma.servicePayment.findUnique.mockResolvedValue({ status: 'COMPLETED', method: PaymentMethod.CASH, amountCdf: 150000 });
    const r = await service.settleDeposit('b2', { customerUserId: 'c1', ownerUserId: 'o1', depositCdf: 50000, retainedCdf: 0 });
    expect(r).toMatchObject({ moved: false, reason: 'cash' });
    expect(wallet.credit).not.toHaveBeenCalled();
  });

  it('compensates the owner in cash when a SENGA promo exceeds the commission', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        referenceType: 'RENTAL', referenceId: 'b3', ownerUserId: 'o1',
        partnerNetCdf: 88000, platformFeeCdf: 0, subtotalGrossCdf: 100000, depositCdf: 0,
        rentalPaidCdf: 80000, logistics: null,
      }),
    });
    await service.creditRentalSettlement('b3', PaymentMethod.CASH);
    expect(wallet.credit).toHaveBeenCalledWith('o1', 8000, expect.any(String), 'PROMO_TOPUP:RENTAL:b3');
    expect(wallet.recordPlatformPromoCost).toHaveBeenCalledWith(8000, expect.any(String), 'PROMO_COST:RENTAL:b3');
  });
});
