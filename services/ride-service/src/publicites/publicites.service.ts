import { Injectable } from '@nestjs/common';
import { PubliciteCible, Prisma } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PubliciteInput = {
  titre?: string;
  imageUrl?: string;
  lien?: string | null;
  description?: string | null;
  cible?: PubliciteCible | string;
  isActive?: boolean;
  dateDebut?: string | Date;
  dateFin?: string | Date | null;
  sortOrder?: number;
};

@Injectable()
export class PublicitesService {
  constructor(private prisma: PrismaService) {}

  private toRecord(row: {
    id: string;
    titre: string;
    imageUrl: string;
    lien: string | null;
    description: string | null;
    cible: PubliciteCible;
    isActive: boolean;
    dateDebut: Date;
    dateFin: Date | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      titre: row.titre,
      imageUrl: row.imageUrl,
      lien: row.lien,
      description: row.description,
      cible: row.cible,
      isActive: row.isActive,
      dateDebut: row.dateDebut.toISOString(),
      dateFin: row.dateFin?.toISOString() ?? null,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private parseDate(value: string | Date | undefined | null, field: string): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, `${field} invalide.`);
    }
    return d;
  }

  private normalizeInput(body: PubliciteInput, partial = false) {
    const titre = body.titre?.trim();
    const imageUrl = body.imageUrl?.trim();
    const dateDebut = this.parseDate(body.dateDebut, 'dateDebut');
    const dateFin = this.parseDate(body.dateFin, 'dateFin');

    if (!partial) {
      if (!titre) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Le titre est requis.');
      }
      if (!imageUrl) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "L'image est requise.");
      }
      if (!dateDebut) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'La date de début est requise.');
      }
    }

    if (dateDebut && dateFin && dateFin < dateDebut) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'La date de fin doit être postérieure à la date de début.',
      );
    }

    const cibleRaw = body.cible?.toString().toUpperCase();
    const cible = cibleRaw && Object.values(PubliciteCible).includes(cibleRaw as PubliciteCible)
      ? (cibleRaw as PubliciteCible)
      : undefined;

    const data: Prisma.PubliciteUpdateInput = {};
    if (titre !== undefined) data.titre = titre;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (body.lien !== undefined) data.lien = body.lien?.trim() || null;
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (cible !== undefined) data.cible = cible;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (dateDebut !== undefined) data.dateDebut = dateDebut;
    if (dateFin !== undefined) data.dateFin = dateFin;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

    return data;
  }

  async listAdmin() {
    const rows = await this.prisma.publicite.findMany({
      orderBy: [{ sortOrder: 'asc' }, { dateDebut: 'desc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  async listActive(cible?: string) {
    const now = new Date();
    const target = cible?.toUpperCase();
    const rows = await this.prisma.publicite.findMany({
      where: {
        isActive: true,
        dateDebut: { lte: now },
        OR: [{ dateFin: null }, { dateFin: { gte: now } }],
        ...(target && target !== 'TOUS'
          ? { cible: { in: [PubliciteCible.TOUS, target as PubliciteCible] } }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { dateDebut: 'desc' }],
    });
    return { data: rows.map((row) => this.toRecord(row)) };
  }

  async create(body: PubliciteInput) {
    const data = this.normalizeInput(body) as Prisma.PubliciteCreateInput;
    const row = await this.prisma.publicite.create({ data });
    return this.toRecord(row);
  }

  async update(id: string, body: PubliciteInput) {
    const existing = await this.prisma.publicite.findUnique({ where: { id } });
    if (!existing) {
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Publicité introuvable.');
    }
    const data = this.normalizeInput(body, true);
    const row = await this.prisma.publicite.update({ where: { id }, data });
    return this.toRecord(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.publicite.findUnique({ where: { id } });
    if (!existing) {
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Publicité introuvable.');
    }
    await this.prisma.publicite.delete({ where: { id } });
    return { success: true };
  }
}
