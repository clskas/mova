import { PlaceOfInterestCategory, PoiSuggestionStatus } from '@prisma/client';
import { PoiSuggestionsService } from './poi-suggestions.service';

describe('PoiSuggestionsService', () => {
  const prisma = {
    poiSuggestion: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    placeOfInterest: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
  };

  const service = new PoiSuggestionsService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('crée une suggestion en attente', async () => {
    prisma.poiSuggestion.create.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      name: 'Marché Test',
      category: PlaceOfInterestCategory.MARKET,
      lat: -4.32,
      lng: 15.31,
      city: 'Kinshasa',
      address: null,
      notes: null,
      status: PoiSuggestionStatus.PENDING,
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      publishedPoiId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.create('u1', {
      name: 'Marché Test',
      category: PlaceOfInterestCategory.MARKET,
      lat: -4.32,
      lng: 15.31,
      city: 'Kinshasa',
    });

    expect(result.status).toBe('PENDING');
    expect(prisma.poiSuggestion.create).toHaveBeenCalled();
  });

  it('publie un POI à l\'approbation', async () => {
    prisma.poiSuggestion.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      name: 'Pharmacie Centre',
      category: PlaceOfInterestCategory.PHARMACY,
      lat: -4.32,
      lng: 15.31,
      city: 'Kinshasa',
      address: 'Gombe',
      notes: null,
      status: PoiSuggestionStatus.PENDING,
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      publishedPoiId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.placeOfInterest.create.mockResolvedValue({ id: 'p1', name: 'Pharmacie Centre' });
    prisma.poiSuggestion.update.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      name: 'Pharmacie Centre',
      category: PlaceOfInterestCategory.PHARMACY,
      lat: -4.32,
      lng: 15.31,
      city: 'Kinshasa',
      address: 'Gombe',
      notes: null,
      status: PoiSuggestionStatus.APPROVED,
      rejectionReason: null,
      reviewedBy: 'admin',
      reviewedAt: new Date(),
      publishedPoiId: 'p1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.approve('s1', { reviewedBy: 'admin' });
    expect(result.poi).toMatchObject({ id: 'p1' });
    expect(result.osm.editUrl).toContain('openstreetmap.org');
  });
});
