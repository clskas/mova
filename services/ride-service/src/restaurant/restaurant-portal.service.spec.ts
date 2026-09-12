import { PartnerKycStatus } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { RestaurantPortalService } from './restaurant-portal.service';

describe('RestaurantPortalService', () => {
  const restaurant = {
    id: 'resto-1',
    ownerUserId: 'owner-1',
    name: 'Chez Test',
    cuisine: 'Congolaise',
    address: 'Gombe',
    lat: -4.31,
    lng: 15.3,
    rating: 4.5,
    kycStatus: PartnerKycStatus.PENDING,
    menuItems: [],
    isAcceptingOrders: false,
    promotionLabel: null,
    prepTimeMin: 20,
    courierMode: 'PLATFORM',
    commerceType: 'PHARMACY',
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
    expect(result.menuItems).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Poulet', unitPriceCdf: 8000 })]),
    );
  });

  it('conserve tailles, options et stock à la publication', async () => {
    deliveries.ensureRestaurantForOwner.mockResolvedValue({
      ...restaurant,
      kycStatus: PartnerKycStatus.APPROVED,
    });
    prisma.restaurant.update.mockImplementation(async ({ data }: { data: { menuItems: unknown } }) => ({
      ...restaurant,
      kycStatus: PartnerKycStatus.APPROVED,
      menuItems: data.menuItems,
    }));
    const result = await service.updateMenu('owner-1', {
      menuItems: [
        {
          name: 'Burger',
          unitPriceCdf: 10000,
          stockQty: 4,
          sizes: [{ label: 'XL', priceCdf: 12000 }],
          options: [{ label: 'Bacon', priceCdf: 1500 }],
          requiresPrescription: false,
        },
      ],
    });
    expect(result.menuItems[0]).toMatchObject({
      name: 'Burger',
      stockQty: 4,
      sizes: [{ label: 'XL', priceCdf: 12000 }],
      options: [{ label: 'Bacon', priceCdf: 1500 }],
    });
  });

  it('refuse l\'upload photo menu sans KYC validé', async () => {
    await expect(service.uploadMenuPhoto('owner-1', 'base64')).rejects.toThrow(/validé avant de publier le menu/);
    expect(uploads.uploadMenuPhoto).not.toHaveBeenCalled();
  });

  it('expose commerceType sur le profil partenaire', async () => {
    const profile = await service.getProfile('owner-1');
    expect(profile.commerceType).toBe('PHARMACY');
  });
});
