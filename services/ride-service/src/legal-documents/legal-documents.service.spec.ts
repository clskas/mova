import { LegalDocumentsService } from './legal-documents.service';
import { MovaHttpException } from '@mova/shared';
import { DEFAULT_CGU_TITLE } from './legal-cgu.default';

describe('LegalDocumentsService', () => {
  const prisma = {
    legalDocument: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new LegalDocumentsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function row(over: Record<string, unknown> = {}) {
    return {
      id: 'cgu-1',
      slug: 'cgu',
      version: '1.0',
      title: DEFAULT_CGU_TITLE,
      body: 'Texte CGU',
      format: 'markdown',
      isPublished: false,
      publishedAt: null,
      createdAt: new Date('2026-09-07T10:00:00.000Z'),
      updatedAt: new Date('2026-09-07T10:00:00.000Z'),
      ...over,
    };
  }

  it('renvoie le texte par défaut si aucune version n’est publiée', async () => {
    prisma.legalDocument.findFirst.mockResolvedValue(null);
    const published = await service.getPublished();
    expect(published.source).toBe('fallback');
    expect(published.title).toBe(DEFAULT_CGU_TITLE);
    expect(published.body.length).toBeGreaterThan(100);
  });

  it('refuse une CGU sans version', async () => {
    await expect(service.create({ title: 'CGU', body: 'texte' })).rejects.toBeInstanceOf(MovaHttpException);
  });

  it('crée une version et refuse un doublon', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(null);
    prisma.legalDocument.create.mockResolvedValue(row());
    await service.create({ version: '1.0', title: 'CGU', body: 'texte' });
    expect(prisma.legalDocument.create).toHaveBeenCalled();

    prisma.legalDocument.findUnique.mockResolvedValue(row());
    await expect(service.create({ version: '1.0', title: 'CGU', body: 'texte' })).rejects.toBeInstanceOf(
      MovaHttpException,
    );
  });

  it('refuse de supprimer la version publiée', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(row({ isPublished: true }));
    await expect(service.remove('cgu-1')).rejects.toBeInstanceOf(MovaHttpException);
    expect(prisma.legalDocument.delete).not.toHaveBeenCalled();
  });

  it('publie une version et retire les autres', async () => {
    prisma.legalDocument.findUnique
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ isPublished: true, publishedAt: new Date('2026-09-07T12:00:00.000Z') }));
    prisma.$transaction.mockResolvedValue([]);
    const published = await service.publish('cgu-1');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(published.isPublished).toBe(true);
  });

  it('retire une version publiée', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(row({ isPublished: true }));
    prisma.legalDocument.update.mockResolvedValue(row({ isPublished: false }));
    const result = await service.unpublish('cgu-1');
    expect(result.isPublished).toBe(false);
    expect(prisma.legalDocument.update).toHaveBeenCalledWith({
      where: { id: 'cgu-1' },
      data: { isPublished: false },
    });
  });

  it('refuse de retirer une version déjà en brouillon', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(row({ isPublished: false }));
    await expect(service.unpublish('cgu-1')).rejects.toBeInstanceOf(MovaHttpException);
    expect(prisma.legalDocument.update).not.toHaveBeenCalled();
  });
});
