import { ErrandCategory } from '@prisma/client';
import { ErrandCategoryEstimateService } from './errand-category-estimate.service';

describe('ErrandCategoryEstimateService', () => {
  const rows = [
    {
      category: ErrandCategory.PHARMACY,
      label: 'Pharmacie',
      perItemCdf: 8000,
      keywordPattern: 'pharmac',
      sortOrder: 1,
      isActive: true,
    },
    {
      category: ErrandCategory.MARKET,
      label: 'Marché',
      perItemCdf: 3000,
      keywordPattern: 'marché',
      sortOrder: 2,
      isActive: true,
    },
    {
      category: ErrandCategory.OTHER,
      label: 'Autre',
      perItemCdf: 5000,
      keywordPattern: null,
      sortOrder: 3,
      isActive: true,
    },
  ];

  const prisma = {
    errandCategoryEstimate: {
      findMany: jest.fn().mockResolvedValue(rows),
      findUnique: jest.fn(async ({ where }: { where: { category: ErrandCategory } }) =>
        rows.find((r) => r.category === where.category) ?? null,
      ),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const service = new ErrandCategoryEstimateService(prisma as never);

  it('infère pharmacie depuis les mots-clés', async () => {
    const category = await service.inferCategory('Pharmacie Centrale, Gombe', ['Paracétamol']);
    expect(category).toBe(ErrandCategory.PHARMACY);
  });

  it('estime achats = montant × articles', async () => {
    const total = await service.estimatePurchase(ErrandCategory.MARKET, 4);
    expect(total).toBe(12000);
  });
});
