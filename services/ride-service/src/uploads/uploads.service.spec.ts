import { UploadsService } from './uploads.service';
import {
  isSupabaseStorageConfigured,
  supabaseUploadObject,
} from '@mova/shared';

jest.mock('@mova/shared', () => {
  const actual = jest.requireActual('@mova/shared');
  return {
    ...actual,
    isSupabaseStorageConfigured: jest.fn().mockReturnValue(false),
    supabaseUploadObject: jest.fn(),
    supabaseDownloadObject: jest.fn(),
    supabaseKycBucket: jest.fn().mockReturnValue('kyc-docs'),
    supabaseUploadsBucket: jest.fn().mockReturnValue('uploads'),
  };
});

describe('UploadsService', () => {
  const prisma = {
    restaurant: { findMany: jest.fn().mockResolvedValue([]) },
    uploadedMedia: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ id: 'row-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'APP_ENV' || key === 'NODE_ENV') return 'production';
      return undefined;
    }),
  };

  const service = new UploadsService(config as never, prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    (isSupabaseStorageConfigured as jest.Mock).mockReturnValue(false);
    prisma.uploadedMedia.upsert.mockResolvedValue({});
    prisma.uploadedMedia.findUnique.mockResolvedValue({ id: 'row-1' });
    prisma.uploadedMedia.findMany.mockResolvedValue([]);
    prisma.restaurant.findMany.mockResolvedValue([]);
    config.get.mockImplementation((key: string) => {
      if (key === 'APP_ENV' || key === 'NODE_ENV') return 'production';
      return undefined;
    });
  });

  it('refuse en production sans Supabase (disque Render éphémère)', async () => {
    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await expect(service.uploadMenuPhoto(tinyPng, 'image/png')).rejects.toMatchObject({
      message: expect.stringMatching(/Supabase|indisponible/i),
    });
    expect(prisma.uploadedMedia.upsert).not.toHaveBeenCalled();
  });

  it('persiste en PostgreSQL en développement même sans Supabase', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'APP_ENV' || key === 'NODE_ENV') return 'development';
      return undefined;
    });
    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const result = await service.uploadMenuPhoto(tinyPng, 'image/png');

    expect(result.photoUrl).toMatch(/^\/api\/uploads\/menu\/.+\.png$/);
    expect(result.storage).toBe('db');
    expect(prisma.uploadedMedia.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          category: 'menu',
          mimeType: 'image/png',
        }),
      }),
    );
    expect(prisma.uploadedMedia.findUnique).toHaveBeenCalled();
  });

  it('écrit aussi sur Supabase quand configuré et vérifie Postgres', async () => {
    (isSupabaseStorageConfigured as jest.Mock).mockReturnValue(true);
    (supabaseUploadObject as jest.Mock).mockResolvedValue({
      success: true,
      signedUrl: 'https://example.test/signed',
      publicUrl: 'https://example.test/public',
    });
    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const result = await service.uploadMenuPhoto(tinyPng, 'image/png');
    expect(result.storage).toBe('supabase+db');
    expect(supabaseUploadObject).toHaveBeenCalled();
    expect(prisma.uploadedMedia.upsert).toHaveBeenCalled();
    expect(prisma.uploadedMedia.findUnique).toHaveBeenCalled();
  });

  it('refuse en production si Supabase configuré mais upload échoue', async () => {
    (isSupabaseStorageConfigured as jest.Mock).mockReturnValue(true);
    (supabaseUploadObject as jest.Mock).mockResolvedValue({
      success: false,
      message: 'bucket missing',
    });
    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await expect(service.uploadMenuPhoto(tinyPng, 'image/png')).rejects.toMatchObject({
      message: expect.stringMatching(/Supabase|bucket/i),
    });
  });

  it('refuse si la ligne Postgres est absente après upsert', async () => {
    (isSupabaseStorageConfigured as jest.Mock).mockReturnValue(true);
    (supabaseUploadObject as jest.Mock).mockResolvedValue({ success: true });
    prisma.uploadedMedia.findUnique.mockResolvedValue(null);
    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await expect(service.uploadMenuPhoto(tinyPng, 'image/png')).rejects.toMatchObject({
      message: expect.stringMatching(/persistance/i),
    });
  });
});
