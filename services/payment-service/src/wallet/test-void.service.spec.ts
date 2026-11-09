import { MOVA_PLATFORM_USER_ID } from '@mova/shared';
import { TestVoidService } from './test-void.service';

describe('TestVoidService', () => {
  const tx = (id: string, userId: string, type: string, amountCdf: number) => ({
    id,
    type,
    amountCdf,
    reference: `PLATFORM_FEE:RIDE:ride-00000001`,
    description: 'x',
    wallet: { userId },
  });

  function make(voidedIds: string[] = []) {
    const prisma = {
      walletTransaction: {
        findMany: jest.fn().mockResolvedValue([
          tx('t1', 'passenger', 'DEBIT', 10000),
          tx('t2', 'driver', 'CREDIT', 8500),
          tx('t3', MOVA_PLATFORM_USER_ID, 'CREDIT', 1500),
        ]),
        findFirst: jest.fn().mockImplementation(({ where }: { where: { reference: string } }) =>
          Promise.resolve(voidedIds.some((v) => where.reference === `TEST_VOID:${v}`) ? { id: 'v' } : null),
        ),
      },
      driverCashDebt: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      payment: { updateMany: jest.fn() },
      servicePayment: { updateMany: jest.fn() },
    };
    const wallet = {
      debit: jest.fn().mockResolvedValue({}),
      credit: jest.fn().mockResolvedValue({}),
      releaseHold: jest.fn().mockResolvedValue({ released: false }),
    };
    return { service: new TestVoidService(prisma as never, wallet as never), prisma, wallet };
  }

  it('preview: commission = platform credits, changes nothing', async () => {
    const t = make();
    const res = await t.service.preview([{ referenceType: 'RIDE', referenceId: 'ride-00000001' }]);
    expect(res.platformCommissionCdf).toBe(1500);
    expect(t.wallet.debit).not.toHaveBeenCalled();
    expect(t.wallet.credit).not.toHaveBeenCalled();
  });

  it('apply: every entry reversed by the opposite entry, once', async () => {
    const t = make();
    await t.service.apply([{ referenceType: 'RIDE', referenceId: 'ride-00000001' }]);
    expect(t.wallet.credit).toHaveBeenCalledWith('passenger', 10000, expect.any(String), 'TEST_VOID:t1');
    expect(t.wallet.debit).toHaveBeenCalledWith('driver', 8500, expect.any(String), 'TEST_VOID:t2');
    expect(t.wallet.debit).toHaveBeenCalledWith(MOVA_PLATFORM_USER_ID, 1500, expect.any(String), 'TEST_VOID:t3');
    expect(t.prisma.payment.updateMany).toHaveBeenCalled();
  });

  it('apply: entries already voided are skipped; a short balance is reported, not hidden', async () => {
    const t = make(['t1', 't3']);
    t.wallet.debit.mockRejectedValueOnce(new Error('Solde insuffisant'));
    const res = await t.service.apply([{ referenceType: 'RIDE', referenceId: 'ride-00000001' }]);
    expect(t.wallet.credit).not.toHaveBeenCalled();
    expect(res.items[0]!.failed).toEqual([expect.objectContaining({ txId: 't2', amountCdf: 8500 })]);
  });
});
