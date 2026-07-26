import { PricingAdminService } from './pricing-admin.service';
import { SurchargeType, VehicleType } from '@prisma/client';
import { MovaHttpException } from '@mova/shared';

describe('PricingAdminService', () => {
  const prisma = {
    pricingRule: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    serviceSurcharge: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    promoCode: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  };

  const service = new PricingAdminService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('liste les règles tarifaires', async () => {
    prisma.pricingRule.findMany.mockResolvedValue([{ vehicleType: VehicleType.STANDARD }]);
    await expect(service.listRules()).resolves.toHaveLength(1);
  });

  it('met à jour une majoration déménagement', async () => {
    prisma.serviceSurcharge.findUnique.mockResolvedValue({ type: SurchargeType.MOVING });
    prisma.serviceSurcharge.update.mockResolvedValue({ type: SurchargeType.MOVING, baseFeeCdf: 20000 });
    const result = await service.updateSurcharge(SurchargeType.MOVING, { baseFeeCdf: 20000 });
    expect(result.baseFeeCdf).toBe(20000);
  });

  it('rejette un code promo sans réduction', async () => {
    await expect(service.createPromoCode({ code: 'SENGA' })).rejects.toBeInstanceOf(MovaHttpException);
  });

  it('crée un code promo valide', async () => {
    prisma.promoCode.create.mockResolvedValue({ code: 'MOVA10', discountPercent: 10 });
    const result = await service.createPromoCode({ code: 'mova10', discountPercent: 10 });
    expect(result.code).toBe('MOVA10');
  });

  it('liste les majorations livraison', async () => {
    prisma.serviceSurcharge.findMany.mockResolvedValue([
      { type: SurchargeType.DELIVERY_FOOD, baseFeeCdf: 3000, multiplier: 1.0, perUnitCdf: null, description: 'Repas', isActive: true },
      { type: SurchargeType.MOVING, baseFeeCdf: 15000, multiplier: 1.5, perUnitCdf: 8000, description: 'Déménagement', isActive: true },
    ]);
    const rules = await service.listDeliveryPricingRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].category).toBe('FOOD');
  });

  it('rejette une catégorie livraison invalide', async () => {
    await expect(service.updateDeliveryPricingRule('INVALID', { baseFeeCdf: 100 })).rejects.toBeInstanceOf(MovaHttpException);
  });
});
