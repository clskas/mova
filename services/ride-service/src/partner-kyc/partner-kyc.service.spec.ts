import { PartnerKycService } from './partner-kyc.service';
import { MovaHttpException } from '@mova/shared';

describe('PartnerKycService', () => {
  const prisma = {
    restaurant: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    rentalPartnerProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    partnerKycDocument: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const uploads = { uploadKycDocument: jest.fn() };
  const service = new PartnerKycService(prisma as never, uploads as never);

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as jest.Mock;
  });

  it('refuse un document sans motif', async () => {
    await expect(service.reviewDocument('doc-1', false, '')).rejects.toBeInstanceOf(MovaHttpException);
    expect(prisma.partnerKycDocument.update).not.toHaveBeenCalled();
  });

  it('enregistre le motif de refus sur le document', async () => {
    prisma.partnerKycDocument.findUnique.mockResolvedValue({
      id: 'doc-1',
      userId: 'u1',
      subject: 'RESTAURANT',
      type: 'RCCM',
    });
    prisma.partnerKycDocument.update.mockResolvedValue({
      id: 'doc-1',
      userId: 'u1',
      subject: 'RESTAURANT',
      type: 'RCCM',
      status: 'REJECTED',
      notes: 'RCCM illisible, renvoyer une photo nette',
      url: '/api/uploads/kyc/a.jpg',
    });
    prisma.restaurant.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.reviewDocument('doc-1', false, 'RCCM illisible, renvoyer une photo nette');
    expect(result.notes).toBe('RCCM illisible, renvoyer une photo nette');
    expect(prisma.partnerKycDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          notes: 'RCCM illisible, renvoyer une photo nette',
        }),
      }),
    );
  });

  it('envoie le PIN de connexion à l\'approbation (SMS mock)', async () => {
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'r1',
      ownerUserId: 'u1',
      kycStatus: 'PENDING',
      kycNotes: null,
      nif: 'NIF-1',
      rccm: 'CD/KIN/RCCM/1',
      payoutProvider: 'ORANGE_MONEY',
      payoutPhone: '+243810000001',
      address: 'Gombe',
    });
    prisma.partnerKycDocument.findMany.mockResolvedValue([
      { type: 'MANAGER_ID', status: 'PENDING', notes: null, url: '/a', id: 'd1' },
      { type: 'RCCM', status: 'PENDING', notes: null, url: '/b', id: 'd2' },
      { type: 'PREMISES_PHOTO', status: 'PENDING', notes: null, url: '/c', id: 'd3' },
    ]);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ phone: '+243810000001', name: 'Chez Flore' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ loginPin: '847291', smsSent: true, hasPhone: true, emailSent: false }),
      });
    prisma.partnerKycDocument.updateMany.mockResolvedValue({ count: 3 });
    prisma.restaurant.update.mockResolvedValue({});

    const result = await service.reviewSubject('u1', 'RESTAURANT', true);
    expect(result.smsSent).toBe(true);
    expect(result.loginPin).toBe('847291');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/internal/users/u1/issue-login-pin'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
