import { PaymentMethod } from '@prisma/client';
import { RentalPayoutService } from './rental-payout.service';

describe('RentalPayoutService', () => {
  const prisma = {
    walletTransaction: { findFirst: jest.fn() },
  };
  const wallet = {
    credit: jest.fn(),
    creditPlatformFee: jest.fn(),
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

  it('espèces : pas de crédit wallet propriétaire, dette commission', async () => {
    const result = await service.creditRentalSettlement('book-1', PaymentMethod.CASH);
    expect(result.handled).toBe(true);
    expect(wallet.credit).not.toHaveBeenCalled();
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
