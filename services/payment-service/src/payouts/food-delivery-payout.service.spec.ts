import { CashDebtCategory, PaymentMethod } from '@prisma/client';
import { FoodDeliveryPayoutService } from './food-delivery-payout.service';

describe('FoodDeliveryPayoutService cash', () => {
  const prisma = {
    walletTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
    servicePayment: { findUnique: jest.fn() },
  };
  const wallet = {
    credit: jest.fn().mockResolvedValue({ balanceCdf: 1000 }),
    creditPlatformFee: jest.fn(),
  };
  const driverPayouts = {
    creditPayout: jest.fn().mockResolvedValue({ credited: true }),
  };
  const debtLedger = {
    recordDebt: jest.fn().mockResolvedValue({ recorded: true }),
  };

  let service: FoodDeliveryPayoutService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FoodDeliveryPayoutService(
      prisma as never,
      wallet as never,
      driverPayouts as never,
      debtLedger as never,
    );
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        referenceType: 'DELIVERY',
        referenceId: 'del-1',
        deliveryType: 'FOOD',
        totalPaidCdf: 15000,
        platformFeeCdf: 1500,
        driver: { userId: 'drv-1', grossCdf: 3000, netCdf: 2700, platformFeeCdf: 300 },
        restaurants: [
          {
            restaurantId: 'resto-1',
            ownerUserId: 'owner-1',
            grossCdf: 12000,
            netCdf: 10500,
            platformFeeCdf: 1500,
          },
        ],
      }),
    } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not credit restaurant or driver wallets on CASH — records debts only', async () => {
    const result = await service.creditFoodDeliverySettlement('del-1', PaymentMethod.CASH);
    expect(result.handled).toBe(true);
    expect(driverPayouts.creditPayout).not.toHaveBeenCalled();
    expect(wallet.credit).not.toHaveBeenCalled();
    expect(wallet.creditPlatformFee).not.toHaveBeenCalled();
    expect(debtLedger.recordDebt).toHaveBeenCalledWith(
      expect.objectContaining({
        category: CashDebtCategory.RESTAURANT_SHARE,
        amountCdf: 10500,
        beneficiaryUserId: 'owner-1',
      }),
    );
    expect(debtLedger.recordDebt).toHaveBeenCalledWith(
      expect.objectContaining({
        category: CashDebtCategory.PLATFORM_FEE,
        amountCdf: 1500,
      }),
    );
    expect(result.restaurants).toEqual([
      expect.objectContaining({ credited: false, reason: 'cash_in_hand', amountCdf: 10500 }),
    ]);
  });

  it('credits restaurant and driver wallets on WALLET', async () => {
    await service.creditFoodDeliverySettlement('del-1', PaymentMethod.WALLET);
    expect(driverPayouts.creditPayout).toHaveBeenCalled();
    expect(wallet.credit).toHaveBeenCalled();
    expect(debtLedger.recordDebt).not.toHaveBeenCalled();
  });
});
