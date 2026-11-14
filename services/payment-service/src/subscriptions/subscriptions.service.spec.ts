import { SubscriptionTarget } from '@prisma/client';
import { SubscriptionsService } from './subscriptions.service';
import { MovaHttpException } from '@mova/shared';

describe('SubscriptionsService', () => {
  const prisma = {
    subscriptionPlan: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    userSubscription: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn(),
  };

  const wallet = { debit: jest.fn().mockResolvedValue({ balanceCdf: 0 }), creditPlatformFee: jest.fn().mockResolvedValue(null) };
  const service = new SubscriptionsService(prisma as never, wallet as never);

  beforeEach(() => jest.clearAllMocks());

  it('liste les plans actifs', async () => {
    prisma.subscriptionPlan.findMany.mockResolvedValue([{ code: 'MOVA_PLUS_PASSENGER' }]);
    await expect(service.listPlans(true)).resolves.toHaveLength(1);
    expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('crée un plan SENGA Plus', async () => {
    prisma.subscriptionPlan.create.mockResolvedValue({
      code: 'MOVA_PLUS_PASSENGER',
      monthlyPriceCdf: 15000,
    });
    const plan = await service.createPlan({
      code: 'mova_plus_passenger',
      name: 'SENGA Plus',
      target: SubscriptionTarget.PASSENGER,
      monthlyPriceCdf: 15000,
      feeReductionPercent: 10,
      priorityMatching: true,
    });
    expect(plan.code).toBe('MOVA_PLUS_PASSENGER');
  });

  it('signale un plan introuvable', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue(null);
    await expect(service.getPlan('missing')).rejects.toBeInstanceOf(MovaHttpException);
  });
  describe('paid re-subscribe and expiry (audit 2026-11)', () => {
    const plan = { id: 'p1', name: 'SENGA Plus', target: 'PASSENGER', monthlyPriceCdf: 15000, isActive: true };
    const tx = { userSubscription: { findFirst: jest.fn(), create: jest.fn() } };
    beforeEach(() => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue(plan);
      prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
      tx.userSubscription.findFirst.mockResolvedValue(null);
      tx.userSubscription.create.mockResolvedValue({ id: 's', plan });
    });

    it('debits every subscription with its own reference', async () => {
      await service.subscribe('u1', 'p1');
      await service.subscribe('u1', 'p1');
      const refs = wallet.debit.mock.calls.map((c: unknown[]) => c[3]);
      expect(wallet.debit).toHaveBeenCalledTimes(2);
      expect(refs[0]).not.toBe(refs[1]);
      expect(String(refs[0])).toMatch(/^SUBSCRIBE:u1:PASSENGER:/);
    });

    it('the price paid goes to SENGA (platform wallet), same reference as the debit', async () => {
      await service.subscribe('u1', 'p1');
      const debitRef = wallet.debit.mock.calls[0][3];
      expect(wallet.creditPlatformFee).toHaveBeenCalledWith(15000, 'Abonnement SENGA Plus', debitRef);
    });

    it('renewal also credits SENGA', async () => {
      const endsAt = new Date(Date.now() + 6 * 3600 * 1000);
      prisma.userSubscription.findMany.mockResolvedValue([{ id: 's1', userId: 'u1', endsAt, plan }]);
      prisma.userSubscription.update = jest.fn().mockResolvedValue({});
      const renewed = await service.renewDue({ autoRenew: true, remindDaysBefore: 3 }, async () => undefined);
      expect(renewed).toBe(1);
      const ref = wallet.debit.mock.calls[0][3];
      expect(wallet.creditPlatformFee).toHaveBeenCalledWith(15000, expect.stringContaining('renouvellement'), ref);
    });

    it('cancel keeps the paid month: no renewal, benefits until the end date', async () => {
      const endsAt = new Date(Date.now() + 20 * 86_400_000);
      prisma.userSubscription.findFirst.mockResolvedValue({ id: 's1', status: 'ACTIVE', endsAt, plan });
      prisma.userSubscription.update.mockResolvedValue({ id: 's1', status: 'CANCELLED', endsAt, plan });
      const res = await service.cancel('u1');
      expect(prisma.userSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } }),
      );
      expect(res.message).toContain('restent actifs');
      // still counted as running until endsAt
      prisma.userSubscription.findMany.mockResolvedValue([{ id: 's1', status: 'CANCELLED', endsAt, plan }]);
      await expect(service.getActiveSubscription('u1')).resolves.toMatchObject({ id: 's1' });
      expect(prisma.userSubscription.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { userId: 'u1', status: { in: ['ACTIVE', 'CANCELLED'] }, endsAt: { gt: expect.any(Date) } } }),
      );
    });

    it('expires subscriptions past their end date', async () => {
      prisma.userSubscription.findMany.mockResolvedValue([]);
      await service.getActiveSubscription('u1');
      expect(prisma.userSubscription.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', status: 'ACTIVE', endsAt: { lte: expect.any(Date) } },
        data: { status: 'EXPIRED' },
      });
    });
  });
});
