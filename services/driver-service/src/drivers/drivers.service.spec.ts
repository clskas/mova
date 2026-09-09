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
      findMany: jest.fn(),
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
    await service.approveKyc('doc-1', true);
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

  it('PENDING inclut les docs APPROVED des dossiers encore en attente (Approuver le dossier)', async () => {
    prisma.driverProfile.findMany.mockResolvedValue([{ userId: 'u-pending' }]);
    const approvedDoc = {
      id: 'doc-approved',
      userId: 'u-pending',
      type: 'ID_PHOTO',
      status: 'APPROVED',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    };
    prisma.kycDocument.findMany.mockResolvedValue([approvedDoc]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'u-pending', firstName: 'Ada', lastName: 'K', phone: '+243810000001' }),
    });

    const result = await service.pendingKyc('PENDING');
    expect(prisma.driverProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kycStatus: { in: ['PENDING', 'REJECTED'] } },
      }),
    );
    expect(prisma.kycDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { status: { in: ['PENDING', 'REJECTED'] } },
            { userId: { in: ['u-pending'] } },
          ],
        },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('APPROVED');
    expect(result[0].userId).toBe('u-pending');
  });
});
