import { PricingAdminService, assertPricingValues } from './pricing-admin.service';
import { SurchargeType, VehicleType } from '@prisma/client';
import { MovaHttpException } from '@mova/shared';

describe('PricingAdminService', () => {
  const prisma = {
    pricingRule: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    serviceSurcharge: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    promoCode: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
  };

  const service = new PricingAdminService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('refuse un tarif négatif ou un coefficient absurde', () => {
    expect(() => assertPricingValues({ baseFareCdf: -5000 })).toThrow(MovaHttpException);
    expect(() => assertPricingValues({ perKmCdf: 12.5 })).toThrow(MovaHttpException);
    expect(() => assertPricingValues({ peakMultiplier: 100 })).toThrow(MovaHttpException);
    expect(() => assertPricingValues({ baseFareCdf: 2500, perKmCdf: 900, peakMultiplier: 1.3, multiplier: 1 })).not.toThrow();
  });

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

  it('refuse une réduction absurde (500 %, montant négatif, 0 utilisation) et un code en double', async () => {
    await expect(service.createPromoCode({ code: 'X', discountPercent: 500 })).rejects.toBeInstanceOf(MovaHttpException);
    await expect(service.createPromoCode({ code: 'X', discountCdf: -1000 })).rejects.toBeInstanceOf(MovaHttpException);
    await expect(service.createPromoCode({ code: 'X', discountPercent: 10, maxUses: 0 })).rejects.toBeInstanceOf(MovaHttpException);
    prisma.promoCode.findFirst.mockResolvedValueOnce({ id: 'p1', code: 'X' });
    await expect(service.createPromoCode({ code: 'x', discountPercent: 10 })).rejects.toThrow('existe déjà');
    expect(prisma.promoCode.create).not.toHaveBeenCalled();
  });

  it('crée un code promo valide', async () => {
    prisma.promoCode.create.mockResolvedValue({ code: 'MOVA10', discountPercent: 10, cityNames: [] });
    const result = await service.createPromoCode({ code: 'mova10', discountPercent: 10 });
    expect(result.code).toBe('MOVA10');
    expect(prisma.promoCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'MOVA10', discountPercent: 10, cityNames: [] }),
    });
  });

  it('crée un code promo restreint à des villes', async () => {
    prisma.promoCode.create.mockResolvedValue({
      code: 'KIN10',
      discountPercent: 10,
      cityNames: ['Kinshasa', 'Goma'],
    });
    await service.createPromoCode({
      code: 'kin10',
      discountPercent: 10,
      cityNames: ['Kinshasa', ' Goma ', 'Kinshasa'],
    });
    expect(prisma.promoCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'KIN10', cityNames: ['Kinshasa', 'Goma'] }),
    });
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
