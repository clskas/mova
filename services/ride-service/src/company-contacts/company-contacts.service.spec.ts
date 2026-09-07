import { CompanyContactsService } from './company-contacts.service';
import { MovaHttpException } from '@mova/shared';

describe('CompanyContactsService', () => {
  const prisma = {
    companyContact: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new CompanyContactsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function row(over: Record<string, unknown> = {}) {
    return {
      id: 'c1',
      name: 'Marie Support',
      title: 'Responsable support',
      department: 'Support',
      phone: '+243810000001',
      email: 'support@senga.cd',
      notes: null,
      isPublic: true,
      sortOrder: 0,
      createdAt: new Date('2026-09-07T10:00:00.000Z'),
      updatedAt: new Date('2026-09-07T10:00:00.000Z'),
      ...over,
    };
  }

  it('refuse un contact sans nom', async () => {
    await expect(service.create({ phone: '+243810000001' })).rejects.toBeInstanceOf(MovaHttpException);
    expect(prisma.companyContact.create).not.toHaveBeenCalled();
  });

  it('refuse un contact sans téléphone ni e-mail', async () => {
    await expect(service.create({ name: 'Marie' })).rejects.toBeInstanceOf(MovaHttpException);
  });

  it('normalise le téléphone +243 à la création', async () => {
    prisma.companyContact.findFirst.mockResolvedValue(null);
    prisma.companyContact.create.mockResolvedValue(row());
    await service.create({ name: 'Marie Support', phone: '0810000001' });
    expect(prisma.companyContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: '+243810000001', name: 'Marie Support' }),
      }),
    );
  });

  it('liste seulement les contacts publics pour le site', async () => {
    prisma.companyContact.findMany.mockResolvedValue([
      {
        id: 'c1',
        name: 'Support',
        title: 'Accueil',
        department: 'Support',
        phone: '+243810000001',
        email: 'support@senga.cd',
        notes: 'Lun–Sam 8h–20h',
        sortOrder: 0,
      },
    ]);
    const result = await service.listPublic();
    expect(prisma.companyContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPublic: true } }),
    );
    expect(result.data[0].name).toBe('Support');
  });

  it('refuse la suppression d’un contact inconnu', async () => {
    prisma.companyContact.findUnique.mockResolvedValue(null);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(MovaHttpException);
    expect(prisma.companyContact.delete).not.toHaveBeenCalled();
  });
});
