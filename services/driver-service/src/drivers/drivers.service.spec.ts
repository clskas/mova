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
    vehicle: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
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

  it('autorise Approuver le dossier même si un justificatif n\'est pas encore APPROVED', async () => {
    prisma.kycDocument.findMany.mockResolvedValue([
      { type: 'ID_PHOTO', status: 'APPROVED', notes: null, url: '/a', id: 'd1', createdAt: new Date() },
      { type: 'SELFIE', status: 'PENDING', notes: null, url: '/b', id: 'd2', createdAt: new Date() },
    ]);
    prisma.kycDocument.updateMany.mockResolvedValue({ count: 2 });
    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      kycStatus: 'APPROVED',
      vehicles: [],
    });
    prisma.driverProfile.upsert.mockResolvedValue({ id: 'p1', userId: 'u1', kycStatus: 'APPROVED' });
    prisma.driverProfile.update.mockResolvedValue({ id: 'p1', userId: 'u1' });
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', driverProfileId: 'p1' });
    prisma.vehicle.updateMany.mockResolvedValue({ count: 1 });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ smsSent: true, emailSent: false, hasPhone: true, hasEmail: false }),
    });
    const result = await service.setDriverKycStatus('u1', true);
    expect(result.activationPin).toBeTruthy();
    expect(prisma.driverProfile.upsert).toHaveBeenCalled();
    // Approuver le dossier ne doit PAS valider automatiquement le type d'engin.
    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
  });

  function mockApprovalDeps(profile: Record<string, unknown>) {
    prisma.kycDocument.updateMany.mockResolvedValue({ count: 1 });
    prisma.driverProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1', vehicles: [], ...profile });
    prisma.driverProfile.upsert.mockResolvedValue({ id: 'p1', userId: 'u1', kycStatus: 'APPROVED' });
    prisma.driverProfile.update.mockResolvedValue({ id: 'p1', userId: 'u1' });
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', driverProfileId: 'p1' });
  }

  function issuePinCalls() {
    return (global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).includes('/issue-login-pin'));
  }

  it('un 2e clic sur Approuver renvoie le même PIN tant que le chauffeur ne l\'a pas utilisé', async () => {
    mockApprovalDeps({ kycStatus: 'APPROVED', activationPin: '482913', activationPinVerifiedAt: null });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ smsSent: true, emailSent: true, hasPhone: true, hasEmail: true }),
    });
    const result = await service.setDriverKycStatus('u1', true);
    expect(result.activationPin).toBe('482913');
    // Pas de nouveau PIN généré : un seul envoi, avec le PIN existant.
    const calls = issuePinCalls();
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1].body))).toMatchObject({ pin: '482913', notify: true });
  });

  it('deux clics simultanés sur Approuver ne créent qu\'un PIN et un seul envoi', async () => {
    mockApprovalDeps({ kycStatus: 'PENDING', activationPin: null, activationPinVerifiedAt: null });
    let n = 0;
    (global.fetch as jest.Mock).mockImplementation(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { pin?: string; notify?: boolean };
      n += 1;
      await new Promise((r) => setTimeout(r, 5));
      return {
        ok: true,
        json: async () => ({ loginPin: body.pin ?? String(100000 + n), smsSent: true, hasPhone: true }),
      };
    });
    const [a, b] = await Promise.all([service.setDriverKycStatus('u1', true), service.setDriverKycStatus('u1', true)]);
    expect(a.activationPin).toBeTruthy();
    expect(b.activationPin).toBe(a.activationPin);
    expect(issuePinCalls().filter(([, init]) => JSON.parse(String(init.body)).notify === true)).toHaveLength(1);
  });

  it('un PIN déjà utilisé par le chauffeur n\'est pas réutilisé (nouvelle approbation = nouveau PIN)', async () => {
    mockApprovalDeps({ kycStatus: 'APPROVED', activationPin: null, activationPinVerifiedAt: new Date() });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ loginPin: '777111', smsSent: true, hasPhone: true }),
    });
    const result = await service.setDriverKycStatus('u1', true);
    expect(result.activationPin).toBe('777111');
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
