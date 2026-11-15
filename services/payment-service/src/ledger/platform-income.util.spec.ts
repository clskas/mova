import { platformCreditsNotVoided } from './platform-income.util';

describe('platformCreditsNotVoided', () => {
  it('leaves out the credits reversed by the test cleanup', async () => {
    const prisma = {
      walletTransaction: {
        findMany: jest.fn().mockResolvedValue([{ reference: 'TEST_VOID:tx-test-1' }, { reference: 'TEST_VOID:tx-test-2' }]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCdf: 1500 } }),
      },
    };
    await expect(platformCreditsNotVoided(prisma as never, 'w-platform', 'PLATFORM_FEE_CASH_COLLECT:')).resolves.toBe(1500);
    expect(prisma.walletTransaction.aggregate).toHaveBeenCalledWith({
      where: {
        walletId: 'w-platform',
        type: 'CREDIT',
        reference: { startsWith: 'PLATFORM_FEE_CASH_COLLECT:' },
        id: { notIn: ['tx-test-1', 'tx-test-2'] },
      },
      _sum: { amountCdf: true },
    });
  });

  it('sums everything when nothing was voided, 0 when empty', async () => {
    const prisma = {
      walletTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCdf: null } }),
      },
    };
    await expect(platformCreditsNotVoided(prisma as never, 'w', 'PLATFORM_FEE:')).resolves.toBe(0);
    expect(prisma.walletTransaction.aggregate.mock.calls[0][0].where.id).toBeUndefined();
  });
});
