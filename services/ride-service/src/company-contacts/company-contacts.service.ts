import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MovaErrorCode,
  MovaHttpException,
  normalizePhoneRdc,
  validatePhoneRdc,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export type CompanyContactInput = {
  name?: string;
  title?: string | null;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  isPublic?: boolean;
  sortOrder?: number;
};

@Injectable()
export class CompanyContactsService {
  constructor(private prisma: PrismaService) {}

  private toRecord(row: {
    id: string;
    name: string;
    title: string | null;
    department: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    isPublic: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      department: row.department,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
      isPublic: row.isPublic,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private optionalText(value: string | null | undefined) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizePhone(value: string | null | undefined) {
    if (value === undefined) return undefined;
    const text = this.optionalText(value);
    if (!text) return null;
    const phone = normalizePhoneRdc(text);
    if (!validatePhoneRdc(phone)) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Le téléphone doit être un numéro +243 (9 chiffres après l’indicatif).',
      );
    }
    return phone;
  }

  private normalizeEmail(value: string | null | undefined) {
    if (value === undefined) return undefined;
    const text = this.optionalText(value);
    if (!text) return null;
    const email = text.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'L’e-mail n’est pas valide.',
      );
    }
    return email;
  }

  private normalizeInput(body: CompanyContactInput, partial = false) {
    const name = body.name !== undefined ? body.name.trim() : undefined;
    const title = this.optionalText(body.title);
    const department = this.optionalText(body.department);
    const notes = this.optionalText(body.notes);
    const phone = this.normalizePhone(body.phone);
    const email = this.normalizeEmail(body.email);

    if (!partial) {
      if (!name) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Le nom est obligatoire.');
      }
      const hasPhone = !!phone;
      const hasEmail = !!email;
      if (!hasPhone && !hasEmail) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          'Indiquez un téléphone +243 ou un e-mail.',
        );
      }
    }

    const data: Prisma.CompanyContactUpdateInput = {};
    if (name !== undefined) data.name = name;
    if (title !== undefined) data.title = title;
    if (department !== undefined) data.department = department;
    if (notes !== undefined) data.notes = notes;
    if (phone !== undefined) data.phone = phone;
    if (email !== undefined) data.email = email;
    if (body.isPublic !== undefined) data.isPublic = !!body.isPublic;
    if (body.sortOrder !== undefined) data.sortOrder = Number.isFinite(body.sortOrder) ? body.sortOrder : 0;
    return data;
  }

  async listAdmin(search?: string) {
    const q = search?.trim();
    const rows = await this.prisma.companyContact.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { department: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { notes: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  async listPublic() {
    const rows = await this.prisma.companyContact.findMany({
      where: { isPublic: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        title: true,
        department: true,
        phone: true,
        email: true,
        notes: true,
        sortOrder: true,
      },
    });
    return { data: rows };
  }

  async create(body: CompanyContactInput) {
    const data = this.normalizeInput(body) as Prisma.CompanyContactCreateInput;
    if (data.sortOrder === undefined) {
      const last = await this.prisma.companyContact.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
      data.sortOrder = (last?.sortOrder ?? -1) + 1;
    }
    const row = await this.prisma.companyContact.create({ data });
    return this.toRecord(row);
  }

  async update(id: string, body: CompanyContactInput) {
    const existing = await this.prisma.companyContact.findUnique({ where: { id } });
    if (!existing) {
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Contact introuvable.');
    }
    const data = this.normalizeInput(body, true);
    const nextPhone = data.phone === undefined ? existing.phone : (data.phone as string | null);
    const nextEmail = data.email === undefined ? existing.email : (data.email as string | null);
    if (!nextPhone && !nextEmail) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Indiquez un téléphone +243 ou un e-mail.',
      );
    }
    if (data.name !== undefined && !String(data.name).trim()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Le nom est obligatoire.');
    }
    const row = await this.prisma.companyContact.update({ where: { id }, data });
    return this.toRecord(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.companyContact.findUnique({ where: { id } });
    if (!existing) {
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Contact introuvable.');
    }
    await this.prisma.companyContact.delete({ where: { id } });
    return { success: true };
  }
}
