import { PartnerKycService } from './partner-kyc.service';
import { MovaHttpException } from '@mova/shared';

describe('PartnerKycService', () => {
  const prisma = {
    restaurant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
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
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ smsSent: false, emailSent: true, hasPhone: false, hasEmail: true }),
    });
    const result = await service.reviewDocument('doc-1', false, 'RCCM illisible, renvoyer une photo nette');
    expect(result.notes).toBe('RCCM illisible, renvoyer une photo nette');
    expect(result.emailSent).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/internal/users/u1/notify'),
      expect.objectContaining({ method: 'POST' }),
    );
    const notifyBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(notifyBody.smsText).toContain('RCCM illisible, renvoyer une photo nette');
    expect(notifyBody.emailText).toContain('RCCM illisible, renvoyer une photo nette');
    expect(notifyBody.purpose).toBe('kyc_reject');
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
      { type: 'MANAGER_ID', status: 'APPROVED', notes: null, url: '/a', id: 'd1' },
      { type: 'RCCM', status: 'APPROVED', notes: null, url: '/b', id: 'd2' },
      { type: 'PREMISES_PHOTO', status: 'APPROVED', notes: null, url: '/c', id: 'd3' },
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
    prisma.restaurant.update.mockResolvedValue({});

    const result = await service.reviewSubject('u1', 'RESTAURANT', true);
    expect(result.smsSent).toBe(true);
    expect(result.loginPin).toBe('847291');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/internal/users/u1/issue-login-pin'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('envoie le PIN par e-mail si le partenaire n\'a pas de +243', async () => {
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
      { type: 'MANAGER_ID', status: 'APPROVED', notes: null, url: '/a', id: 'd1' },
      { type: 'RCCM', status: 'APPROVED', notes: null, url: '/b', id: 'd2' },
      { type: 'PREMISES_PHOTO', status: 'APPROVED', notes: null, url: '/c', id: 'd3' },
    ]);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ phone: null, email: 'resto@ex.com', name: 'Chez Flore' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ loginPin: '847291', smsSent: false, emailSent: true, hasPhone: false, hasEmail: true }),
      });
    prisma.restaurant.update.mockResolvedValue({});

    const result = await service.reviewSubject('u1', 'RESTAURANT', true);
    expect(result.loginPin).toBe('847291');
    expect(result.emailSent).toBe(true);
    expect(result.smsSent).toBe(false);
  });

  it('refuse d\'approuver le dossier si un justificatif n\'est pas encore validé', async () => {
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
      { type: 'MANAGER_ID', status: 'APPROVED', notes: null, url: '/a', id: 'd1' },
      { type: 'RCCM', status: 'PENDING', notes: null, url: '/b', id: 'd2' },
      { type: 'PREMISES_PHOTO', status: 'APPROVED', notes: null, url: '/c', id: 'd3' },
    ]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ phone: '+243810000001', name: 'Chez Flore' }),
    });
    await expect(service.reviewSubject('u1', 'RESTAURANT', true)).rejects.toMatchObject({
      message: expect.stringMatching(/justificatifs doivent être approuvés/),
    });
    expect(prisma.restaurant.update).not.toHaveBeenCalled();
  });

  it('attribue chaque justificatif au partenaire (nom, téléphone, type français)', async () => {
    prisma.restaurant.findMany.mockResolvedValue([
      {
        id: 'r1',
        name: 'Chez Flore',
        ownerUserId: 'u1',
        kycStatus: 'PENDING',
        kycNotes: null,
        address: 'Gombe',
        nif: null,
        rccm: null,
        payoutProvider: null,
        payoutPhone: null,
      },
    ]);
    prisma.rentalPartnerProfile.findMany.mockResolvedValue([]);
    prisma.partnerKycDocument.findMany
      .mockResolvedValueOnce([
        {
          id: 'doc-rccm',
          userId: 'u1',
          subject: 'RESTAURANT',
          type: 'RCCM',
          status: 'PENDING',
          notes: null,
          url: '/b',
          createdAt: new Date('2026-09-07T10:00:00.000Z'),
        },
      ])
      .mockResolvedValue([
        { type: 'MANAGER_ID', status: 'PENDING', notes: null, url: '/a', id: 'd1' },
        { type: 'RCCM', status: 'PENDING', notes: null, url: '/b', id: 'doc-rccm' },
        { type: 'PREMISES_PHOTO', status: 'PENDING', notes: null, url: '/c', id: 'd3' },
      ]);
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'r1',
      name: 'Chez Flore',
      ownerUserId: 'u1',
      kycStatus: 'PENDING',
      kycNotes: null,
      nif: null,
      rccm: null,
      payoutProvider: null,
      payoutPhone: null,
      address: 'Gombe',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        firstName: 'Flore',
        lastName: 'Kabila',
        phone: '+243810000001',
        email: 'flore@example.com',
        pinConfigured: false,
      }),
    });

    const result = await service.listPendingAdmin();
    expect(result.documents[0].typeLabel).toMatch(/RCCM/);
    expect(result.documents[0].typeLabel).not.toBe('RCCM');
    expect(result.documents[0].displayName).toBe('Chez Flore');
    expect(result.documents[0].partnerKindLabel).toBe('Restaurant');
    expect(result.documents[0].phone).toBe('+243810000001');
    expect(result.documents[0].email).toBe('flore@example.com');
    expect(result.restaurants[0].displayName).toBe('Chez Flore');
    expect(result.restaurants[0].partnerKindLabel).toBe('Restaurant');
    expect(result.restaurants[0].email).toBe('flore@example.com');
    expect(result.restaurants[0].pinConfigured).toBe(false);
    expect(result.restaurants[0].pinPending).toBe(false);
    expect(result.restaurants[0].orphan).toBe(false);
  });

  it('masque un dossier restaurant sans compte auth, sauf fantômes', async () => {
    prisma.restaurant.findMany.mockResolvedValue([
      {
        id: 'r-ghost',
        name: 'Chez Fantôme',
        ownerUserId: 'missing-user',
        kycStatus: 'PENDING',
        kycNotes: null,
        address: 'Gombe',
        nif: null,
        rccm: null,
        payoutProvider: null,
        payoutPhone: null,
      },
    ]);
    prisma.rentalPartnerProfile.findMany.mockResolvedValue([]);
    prisma.partnerKycDocument.findMany.mockResolvedValue([]);
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'r-ghost',
      name: 'Chez Fantôme',
      ownerUserId: 'missing-user',
      kycStatus: 'PENDING',
      kycNotes: null,
      nif: null,
      rccm: null,
      payoutProvider: null,
      payoutPhone: null,
      address: 'Gombe',
    });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({}) });

    const hidden = await service.listPendingAdmin();
    expect(hidden.restaurants).toHaveLength(0);

    const shown = await service.listPendingAdmin(undefined, true);
    expect(shown.restaurants).toHaveLength(1);
    expect(shown.restaurants[0].orphan).toBe(true);
    expect(shown.restaurants[0].hiddenReason).toBe('orphan');
  });

  it('filtre les dossiers partenaires par statut', async () => {
    prisma.restaurant.findMany.mockResolvedValue([]);
    prisma.rentalPartnerProfile.findMany.mockResolvedValue([]);
    prisma.partnerKycDocument.findMany.mockResolvedValue([]);
    await service.listPendingAdmin('APPROVED');
    expect(prisma.restaurant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kycStatus: 'APPROVED' }),
      }),
    );
    expect(prisma.partnerKycDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'APPROVED' },
      }),
    );
  });

  it('garde un dossier PENDING même si tous les justificatifs sont APPROVED', async () => {
    prisma.restaurant.findMany.mockResolvedValue([
      {
        id: 'r1',
        name: 'Chez Flore',
        ownerUserId: 'u1',
        kycStatus: 'PENDING',
        kycNotes: null,
        address: 'Gombe',
        nif: null,
        rccm: null,
        payoutProvider: null,
        payoutPhone: null,
      },
    ]);
    prisma.rentalPartnerProfile.findMany.mockResolvedValue([]);
    prisma.restaurant.findFirst.mockResolvedValue({
      id: 'r1',
      name: 'Chez Flore',
      ownerUserId: 'u1',
      kycStatus: 'PENDING',
      kycNotes: null,
      nif: 'NIF-1',
      rccm: 'CD/KIN/RCCM/1',
      payoutProvider: 'ORANGE_MONEY',
      payoutPhone: '+243810000001',
      address: 'Gombe',
    });
    // 1st call = flat documents feed (0 PENDING rows); later = checklist (all APPROVED)
    prisma.partnerKycDocument.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { type: 'MANAGER_ID', status: 'APPROVED', notes: null, url: '/a', id: 'd1' },
        { type: 'RCCM', status: 'APPROVED', notes: null, url: '/b', id: 'd2' },
        { type: 'PREMISES_PHOTO', status: 'APPROVED', notes: null, url: '/c', id: 'd3' },
      ]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        firstName: 'Flore',
        lastName: 'Kabila',
        phone: '+243810000001',
        email: 'flore@example.com',
        pinConfigured: false,
      }),
    });

    const result = await service.listPendingAdmin('PENDING');
    expect(prisma.restaurant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kycStatus: 'PENDING' }),
      }),
    );
    expect(result.restaurants).toHaveLength(1);
    expect(result.restaurants[0].kycStatus).toBe('PENDING');
    // Checklist may still list required slots; dossier must remain visible for « Approuver le dossier ».
    expect(result.restaurants[0].userId).toBe('u1');
  });
});
