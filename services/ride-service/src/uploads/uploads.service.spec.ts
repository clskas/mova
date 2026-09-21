import { UploadsService } from './uploads.service';

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
    uploadedMedia: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
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
    prisma.uploadedMedia.upsert.mockResolvedValue({});
  });

  it('persiste les photos menu en PostgreSQL (pas seulement disque)', async () => {
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
  });
});
