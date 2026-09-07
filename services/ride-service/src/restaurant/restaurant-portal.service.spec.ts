import { PartnerKycStatus } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { RestaurantPortalService } from './restaurant-portal.service';

describe('RestaurantPortalService', () => {
  const restaurant = {
    id: 'resto-1',
    ownerUserId: 'owner-1',
    name: 'Chez Test',
    kycStatus: PartnerKycStatus.PENDING,
    menuItems: [],
    isAcceptingOrders: false,
    promotionLabel: null,
    prepTimeMin: 20,
  };

  const prisma = {
    restaurant: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const redis = { publish: jest.fn() };
  const uploads = { uploadMenuPhoto: jest.fn() };
  const partnerBilling = {};
  const deliveries = {
    ensureRestaurantForOwner: jest.fn(),
  };

  const service = new RestaurantPortalService(
    prisma as never,
    redis as never,
    uploads as never,
    partnerBilling as never,
    deliveries as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    deliveries.ensureRestaurantForOwner.mockResolvedValue({ ...restaurant });
    prisma.restaurant.findFirst.mockResolvedValue({ ...restaurant });
  });

  it('refuse de publier le menu si le KYC n\'est pas validé', async () => {
    await expect(
      service.updateMenu('owner-1', {
        menuItems: [{ name: 'Poulet', unitPriceCdf: 8000 }],
      }),
    ).rejects.toMatchObject({
      code: MovaErrorCode.VALIDATION_ERROR,
    });
    await expect(service.updateMenu('owner-1', { menuItems: [{ name: 'Poulet', unitPriceCdf: 8000 }] })).rejects.toBeInstanceOf(
      MovaHttpException,
    );
    await expect(service.updateMenu('owner-1', { menuItems: [{ name: 'Poulet', unitPriceCdf: 8000 }] })).rejects.toThrow(
      /validé avant de publier le menu/,
    );
    expect(prisma.restaurant.update).not.toHaveBeenCalled();
  });

  it('autorise la publication du menu après validation SENGA', async () => {
    deliveries.ensureRestaurantForOwner.mockResolvedValue({
      ...restaurant,
      kycStatus: PartnerKycStatus.APPROVED,
    });
    prisma.restaurant.update.mockResolvedValue({
      ...restaurant,
      kycStatus: PartnerKycStatus.APPROVED,
      menuItems: [{ name: 'Poulet', unitPriceCdf: 8000 }],
    });
    const result = await service.updateMenu('owner-1', {
      menuItems: [{ name: 'Poulet', unitPriceCdf: 8000 }],
    });
    expect(prisma.restaurant.update).toHaveBeenCalled();
    expect(result.menuItems).toEqual([{ name: 'Poulet', unitPriceCdf: 8000 }]);
  });

  it('refuse l\'upload photo menu sans KYC validé', async () => {
    await expect(service.uploadMenuPhoto('owner-1', 'base64')).rejects.toThrow(/validé avant de publier le menu/);
    expect(uploads.uploadMenuPhoto).not.toHaveBeenCalled();
  });
});
