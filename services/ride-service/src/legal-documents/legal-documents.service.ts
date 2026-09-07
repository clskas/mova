import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_CGU_BODY,
  DEFAULT_CGU_SLUG,
  DEFAULT_CGU_TITLE,
  DEFAULT_CGU_VERSION,
} from './legal-cgu.default';

const FORMATS = new Set(['markdown', 'html', 'plain']);

export type LegalDocumentInput = {
  slug?: string;
  version?: string;
  title?: string;
  body?: string;
  format?: string;
};

@Injectable()
export class LegalDocumentsService {
  constructor(private prisma: PrismaService) {}

  private toRecord(row: {
    id: string;
    slug: string;
    version: string;
    title: string;
    body: string;
    format: string;
    isPublished: boolean;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      slug: row.slug,
      version: row.version,
      title: row.title,
      body: row.body,
      format: row.format,
      isPublished: row.isPublished,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private fallbackPublic() {
    return {
      id: null as string | null,
      slug: DEFAULT_CGU_SLUG,
      version: DEFAULT_CGU_VERSION,
      title: DEFAULT_CGU_TITLE,
      body: DEFAULT_CGU_BODY,
      format: 'markdown',
      isPublished: true,
      publishedAt: null as string | null,
      source: 'fallback' as const,
    };
  }

  async getPublished(slug = DEFAULT_CGU_SLUG) {
    const row = await this.prisma.legalDocument.findFirst({
      where: { slug, isPublished: true },
      orderBy: { publishedAt: 'desc' },
    });
    if (!row) return this.fallbackPublic();
    return { ...this.toRecord(row), source: 'database' as const };
  }

  async listAdmin(slug = DEFAULT_CGU_SLUG) {
    const rows = await this.prisma.legalDocument.findMany({
      where: { slug },
      orderBy: [{ isPublished: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  private normalize(body: LegalDocumentInput, partial = false) {
    const slug = (body.slug ?? DEFAULT_CGU_SLUG).trim() || DEFAULT_CGU_SLUG;
    if (slug !== DEFAULT_CGU_SLUG) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Seul le document CGU est géré ici.',
      );
    }
    const version = body.version !== undefined ? body.version.trim() : undefined;
    const title = body.title !== undefined ? body.title.trim() : undefined;
    const text = body.body !== undefined ? body.body : undefined;
    const format = body.format !== undefined ? body.format.trim().toLowerCase() : undefined;

    if (!partial) {
      if (!version) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'La version est obligatoire.');
      }
      if (!title) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Le titre est obligatoire.');
      }
      if (text === undefined || !text.trim()) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Le texte des CGU est obligatoire.');
      }
    }
    if (format !== undefined && !FORMATS.has(format)) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Format invalide (markdown, html ou plain).',
      );
    }
    if (version !== undefined && version.length > 32) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Version trop longue.');
    }
    if (text !== undefined && text.length > 200_000) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Texte trop long.');
    }

    const data: Prisma.LegalDocumentCreateInput | Prisma.LegalDocumentUpdateInput = { slug };
    if (version !== undefined) data.version = version;
    if (title !== undefined) data.title = title;
    if (text !== undefined) data.body = text;
    if (format !== undefined) data.format = format;
    return data;
  }

  async create(body: LegalDocumentInput) {
    const data = this.normalize(body) as Prisma.LegalDocumentCreateInput;
    const existing = await this.prisma.legalDocument.findUnique({
      where: { slug_version: { slug: data.slug, version: data.version } },
    });
    if (existing) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        `La version ${data.version} existe déjà.`,
      );
    }
    const row = await this.prisma.legalDocument.create({ data });
    return this.toRecord(row);
  }

  async update(id: string, body: LegalDocumentInput) {
    const existing = await this.prisma.legalDocument.findUnique({ where: { id } });
    if (!existing) {
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'CGU introuvable.');
    }
    const data = this.normalize({ ...body, slug: existing.slug }, true);
    if (data.version && data.version !== existing.version) {
      const clash = await this.prisma.legalDocument.findUnique({
        where: { slug_version: { slug: existing.slug, version: String(data.version) } },
      });
      if (clash) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          `La version ${String(data.version)} existe déjà.`,
        );
      }
    }
    const row = await this.prisma.legalDocument.update({ where: { id }, data });
    return this.toRecord(row);
  }

  async publish(id: string) {
    const existing = await this.prisma.legalDocument.findUnique({ where: { id } });
    if (!existing) {
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'CGU introuvable.');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.legalDocument.updateMany({
        where: { slug: existing.slug, isPublished: true, NOT: { id } },
        data: { isPublished: false },
      }),
      this.prisma.legalDocument.update({
        where: { id },
        data: { isPublished: true, publishedAt: now },
      }),
    ]);
    const row = await this.prisma.legalDocument.findUnique({ where: { id } });
    return this.toRecord(row!);
  }

  async unpublish(id: string) {
    const existing = await this.prisma.legalDocument.findUnique({ where: { id } });
    if (!existing) {
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'CGU introuvable.');
    }
    if (!existing.isPublished) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Cette version n’est pas publiée.',
      );
    }
    const row = await this.prisma.legalDocument.update({
      where: { id },
      data: { isPublished: false },
    });
    return this.toRecord(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.legalDocument.findUnique({ where: { id } });
    if (!existing) {
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'CGU introuvable.');
    }
    if (existing.isPublished) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Publiez une autre version avant de supprimer la CGU en vigueur.',
      );
    }
    await this.prisma.legalDocument.delete({ where: { id } });
    return { success: true };
  }
}
