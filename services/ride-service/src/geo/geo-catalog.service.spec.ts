import { MovaErrorCode } from '@mova/shared';
import { GeoService } from './geo.service';

describe('GeoService catalog POI', () => {
  const prisma = {
    commune: { findMany: jest.fn() },
    placeOfInterest: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new GeoService(prisma as never, {} as never, {} as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('liste le catalogue sans mix Mapbox', async () => {
    prisma.placeOfInterest.findMany.mockResolvedValue([{ id: 'p1', name: 'Marché Central', city: 'Kinshasa' }]);
    prisma.placeOfInterest.count.mockResolvedValue(1);
    const result = await service.listCatalogPlaces({ city: 'Kinshasa', q: 'marché' });
    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe('Marché Central');
    expect(prisma.placeOfInterest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          city: { equals: 'Kinshasa', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('renomme un lieu du catalogue', async () => {
    prisma.placeOfInterest.findUnique.mockResolvedValue({
      id: 'p1',
      name: 'Marché Central',
      city: 'Kinshasa',
      category: 'MARKET',
    });
    prisma.placeOfInterest.update.mockResolvedValue({
      id: 'p1',
      name: 'Marché Central de Kinshasa',
      city: 'Kinshasa',
    });
    const updated = await service.updateCatalogPlace('p1', { name: '  Marché Central de Kinshasa  ' });
    expect(updated.name).toBe('Marché Central de Kinshasa');
    expect(prisma.placeOfInterest.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { name: 'Marché Central de Kinshasa' },
    });
  });

  it('refuse un nom trop court', async () => {
    prisma.placeOfInterest.findUnique.mockResolvedValue({ id: 'p1', name: 'X' });
    await expect(service.updateCatalogPlace('p1', { name: 'A' })).rejects.toMatchObject({
      code: MovaErrorCode.VALIDATION_ERROR,
    });
    expect(prisma.placeOfInterest.update).not.toHaveBeenCalled();
  });
});
