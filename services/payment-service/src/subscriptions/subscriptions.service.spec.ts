import { SubscriptionTarget } from '@prisma/client';
import { SubscriptionsService } from './subscriptions.service';
import { MovaHttpException } from '@mova/shared';

describe('SubscriptionsService', () => {
  const prisma = {
    subscriptionPlan: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    userSubscription: { findMany: jest.fn() },
  };

  const service = new SubscriptionsService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('liste les plans actifs', async () => {
    prisma.subscriptionPlan.findMany.mockResolvedValue([{ code: 'MOVA_PLUS_PASSENGER' }]);
    await expect(service.listPlans(true)).resolves.toHaveLength(1);
    expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('crée un plan MOVA Plus', async () => {
    prisma.subscriptionPlan.create.mockResolvedValue({
      code: 'MOVA_PLUS_PASSENGER',
      monthlyPriceCdf: 15000,
    });
    const plan = await service.createPlan({
      code: 'mova_plus_passenger',
      name: 'MOVA Plus',
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
});
