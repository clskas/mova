import { Injectable } from '@nestjs/common';
import { BlacklistType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ModerationService {
  constructor(private prisma: PrismaService) {}

  async writeAudit(input: {
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    meta?: Record<string, unknown> | null;
    ip?: string | null;
  }) {
    return this.prisma.adminAuditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action.trim(),
        resourceType: input.resourceType.trim(),
        resourceId: input.resourceId?.trim() || null,
        meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: input.ip?.trim() || null,
      },
    });
  }

  async listAudit(opts?: {
    skip?: number;
    take?: number;
    actorUserId?: string;
    action?: string;
    resourceType?: string;
    from?: string;
    to?: string;
  }) {
    const skip = Math.max(0, Number(opts?.skip ?? 0));
    const take = Math.min(200, Math.max(1, Number(opts?.take ?? 50)));
    const where: Prisma.AdminAuditLogWhereInput = {};
    if (opts?.actorUserId?.trim()) where.actorUserId = opts.actorUserId.trim();
    if (opts?.action?.trim()) where.action = { contains: opts.action.trim(), mode: 'insensitive' };
    if (opts?.resourceType?.trim()) where.resourceType = opts.resourceType.trim();
    const fromAt = this.parseDay(opts?.from, false);
    const toAt = this.parseDay(opts?.to, true);
    if (fromAt || toAt) {
      where.createdAt = {
        ...(fromAt ? { gte: fromAt } : {}),
        ...(toAt ? { lte: toAt } : {}),
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return { data, total, skip, take };
  }

  async listBlacklist(opts?: { skip?: number; take?: number; type?: string; activeOnly?: boolean; q?: string }) {
    const skip = Math.max(0, Number(opts?.skip ?? 0));
    const take = Math.min(200, Math.max(1, Number(opts?.take ?? 50)));
    const where: Prisma.BlacklistEntryWhereInput = {};
    if (opts?.activeOnly !== false) where.active = true;
    const type = this.parseType(opts?.type);
    if (type) where.type = type;
    const q = opts?.q?.trim();
    if (q) {
      where.OR = [
        { value: { contains: q, mode: 'insensitive' } },
        { reason: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.blacklistEntry.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.blacklistEntry.count({ where }),
    ]);
    return { data, total, skip, take };
  }

  async upsertBlacklist(input: {
    type: string;
    value: string;
    reason: string;
    expiresAt?: string | null;
    createdBy?: string | null;
    active?: boolean;
  }) {
    const type = this.parseType(input.type);
    if (!type) throw new Error('Type blacklist invalide');
    const value = input.value.trim().toLowerCase();
    if (!value) throw new Error('Valeur blacklist requise');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    return this.prisma.blacklistEntry.upsert({
      where: { type_value: { type, value } },
      create: {
        type,
        value,
        reason: input.reason.trim() || 'Sans motif',
        expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        createdBy: input.createdBy ?? null,
        active: input.active !== false,
      },
      update: {
        reason: input.reason.trim() || 'Sans motif',
        expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        active: input.active !== false,
        createdBy: input.createdBy ?? undefined,
      },
    });
  }

  async deactivateBlacklist(id: string) {
    return this.prisma.blacklistEntry.update({
      where: { id },
      data: { active: false },
    });
  }

  /** True if phone/email/userId is actively blacklisted (and not expired). */
  async isBlocked(opts: { phone?: string | null; email?: string | null; userId?: string | null }) {
    const now = new Date();
    const or: Prisma.BlacklistEntryWhereInput[] = [];
    if (opts.phone?.trim()) {
      or.push({ type: BlacklistType.PHONE, value: opts.phone.trim().toLowerCase() });
    }
    if (opts.email?.trim()) {
      or.push({ type: BlacklistType.EMAIL, value: opts.email.trim().toLowerCase() });
    }
    if (opts.userId?.trim()) {
      or.push({ type: BlacklistType.USER_ID, value: opts.userId.trim().toLowerCase() });
    }
    if (or.length === 0) return { blocked: false as const };
    const hit = await this.prisma.blacklistEntry.findFirst({
      where: {
        active: true,
        OR: or,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
    });
    if (!hit) return { blocked: false as const };
    return {
      blocked: true as const,
      reason: hit.reason,
      type: hit.type,
      value: hit.value,
    };
  }

  private parseType(raw?: string): BlacklistType | undefined {
    const upper = raw?.trim().toUpperCase();
    if (!upper) return undefined;
    return (Object.values(BlacklistType) as string[]).includes(upper)
      ? (upper as BlacklistType)
      : undefined;
  }

  private parseDay(ymd?: string, endOfDay = false): Date | undefined {
    const s = ymd?.trim();
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
    const d = new Date(`${s}T${endOfDay ? '23:59:59.999' : '00:00:00'}+01:00`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
}
