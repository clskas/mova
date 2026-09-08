import { MovaHttpException } from '@mova/shared';
import { DriversService } from './drivers.service';

describe('DriversService KYC dossier', () => {
  const prisma = {
    kycDocument: {
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    driverProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new DriversService(prisma as never, {} as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as jest.Mock;
  });

  it('n\'émet pas de PIN à l\'approbation d\'un seul justificatif', async () => {
    prisma.kycDocument.update.mockResolvedValue({
      id: 'doc-1',
      userId: 'u1',
      type: 'ID_PHOTO',
      status: 'APPROVED',
    });
    const result = await service.approveKyc('doc-1', true);
    expect(result.loginPin).toBeUndefined();
    expect(result.activationPin).toBeUndefined();
    expect(prisma.kycDocument.updateMany).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuse Approuver le dossier tant qu\'un justificatif n\'est pas APPROVED', async () => {
    prisma.kycDocument.findMany.mockResolvedValue([
      { type: 'ID_PHOTO', status: 'APPROVED', notes: null, url: '/a', id: 'd1', createdAt: new Date() },
      { type: 'SELFIE', status: 'PENDING', notes: null, url: '/b', id: 'd2', createdAt: new Date() },
    ]);
    await expect(service.setDriverKycStatus('u1', true)).rejects.toBeInstanceOf(MovaHttpException);
    expect(prisma.driverProfile.upsert).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

});
