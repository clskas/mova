import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_CGU_BODY,
  DEFAULT_CGU_SLUG,
  DEFAULT_CGU_TITLE,
  DEFAULT_CGU_VERSION,
} from './legal-cgu.default';
import {
  DEFAULT_PRIVACY_BODY,
  DEFAULT_PRIVACY_SLUG,
  DEFAULT_PRIVACY_TITLE,
  DEFAULT_PRIVACY_VERSION,
} from './legal-privacy.default';

const FORMATS = new Set(['markdown', 'html', 'plain']);
const ALLOWED_SLUGS = new Set([DEFAULT_CGU_SLUG, DEFAULT_PRIVACY_SLUG]);

function isPrismaUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export type LegalDocumentInput = {
  slug?: string;
  version?: string;
  title?: string;
  body?: string;
  format?: string;
};

type LegalDefaults = {
  slug: string;
  version: string;
  title: string;
  body: string;
};

@Injectable()
export class LegalDocumentsService implements OnModuleInit {
  private readonly logger = new Logger(LegalDocumentsService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    void this.ensureDefaultPublished(DEFAULT_CGU_SLUG).catch((err: unknown) => {
      this.logger.warn(`CGU bootstrap skipped: ${err instanceof Error ? err.message : String(err)}`);
    });
    void this.ensureDefaultPublished(DEFAULT_PRIVACY_SLUG).catch((err: unknown) => {
      this.logger.warn(`Privacy bootstrap skipped: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private defaultsFor(slug: string): LegalDefaults {
    if (slug === DEFAULT_PRIVACY_SLUG) {
      return {
        slug: DEFAULT_PRIVACY_SLUG,
        version: DEFAULT_PRIVACY_VERSION,
        title: DEFAULT_PRIVACY_TITLE,
        body: DEFAULT_PRIVACY_BODY,
      };
    }
    return {
      slug: DEFAULT_CGU_SLUG,
      version: DEFAULT_CGU_VERSION,
      title: DEFAULT_CGU_TITLE,
      body: DEFAULT_CGU_BODY,
    };
  }

  private assertSlug(slug: string) {
    if (!ALLOWED_SLUGS.has(slug)) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Document légal non supporté.',
      );
    }
  }

  private labelFor(slug: string) {
    return slug === DEFAULT_PRIVACY_SLUG ? 'Politique de confidentialité' : 'CGU';
  }

  /**
   * Idempotent: inserts the in-app default as published 1.0 when no row exists for the slug.
   */
  async ensureDefaultPublished(slug = DEFAULT_CGU_SLUG) {
    this.assertSlug(slug);
    const existing = await this.prisma.legalDocument.findFirst({
      where: { slug },
      select: { id: true },
    });
    if (existing) return;

    const defaults = this.defaultsFor(slug);
    const now = new Date();
    try {
      const row = await this.prisma.legalDocument.create({
        data: {
          slug: defaults.slug,
          version: defaults.version,
          title: defaults.title,
          body: defaults.body,
          format: 'markdown',
          isPublished: true,
          publishedAt: now,
        },
      });
      this.logger.log(`${this.labelFor(slug)} ${defaults.version} créée et publiée (texte par défaut).`);
      return this.toRecord(row);
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
      this.logger.log(`${this.labelFor(slug)} ${defaults.version} déjà présente — bootstrap ignoré.`);
    }
  }

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

  private fallbackPublic(slug = DEFAULT_CGU_SLUG) {
    const defaults = this.defaultsFor(slug);
    return {
      id: null as string | null,
      slug: defaults.slug,
      version: defaults.version,
      title: defaults.title,
      body: defaults.body,
      format: 'markdown',
      isPublished: true,
      publishedAt: null as string | null,
      source: 'fallback' as const,
    };
  }

  async getPublished(slug = DEFAULT_CGU_SLUG) {
    this.assertSlug(slug);
    const row = await this.prisma.legalDocument.findFirst({
      where: { slug, isPublished: true },
      orderBy: { publishedAt: 'desc' },
    });
    if (!row) return this.fallbackPublic(slug);
    return { ...this.toRecord(row), source: 'database' as const };
  }

  async listAdmin(slug = DEFAULT_CGU_SLUG) {
    this.assertSlug(slug);
    await this.ensureDefaultPublished(slug);
    const rows = await this.prisma.legalDocument.findMany({
      where: { slug },
      orderBy: [{ isPublished: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  private normalize(body: LegalDocumentInput, partial = false, forcedSlug?: string) {
    const slug = (forcedSlug ?? body.slug ?? DEFAULT_CGU_SLUG).trim() || DEFAULT_CGU_SLUG;
    this.assertSlug(slug);
    const version = body.version !== undefined ? body.version.trim() : undefined;
    const title = body.title !== undefined ? body.title.trim() : undefined;
    const text = body.body !== undefined ? body.body : undefined;
    const format = body.format !== undefined ? body.format.trim().toLowerCase() : undefined;
    const label = this.labelFor(slug);

    if (!partial) {
      if (!version) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'La version est obligatoire.');
      }
      if (!title) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Le titre est obligatoire.');
      }
      if (text === undefined || !text.trim()) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          `Le texte de la ${label} est obligatoire.`,
        );
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

  async create(body: LegalDocumentInput, forcedSlug?: string) {
    const data = this.normalize(body, false, forcedSlug) as Prisma.LegalDocumentCreateInput;
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
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Document introuvable.');
    }
    const data = this.normalize({ ...body, slug: existing.slug }, true, existing.slug);
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
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Document introuvable.');
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
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Document introuvable.');
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
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Document introuvable.');
    }
    if (existing.isPublished) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        `Publiez une autre version avant de supprimer la ${this.labelFor(existing.slug)} en vigueur.`,
      );
    }
    await this.prisma.legalDocument.delete({ where: { id } });
    return { success: true };
  }
}
