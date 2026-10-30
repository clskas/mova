import { Injectable, Optional } from '@nestjs/common';
import { BlacklistType, Prisma } from '@prisma/client';
import { denyJwtUser, normalizePhoneRdc, RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ModerationService {
  constructor(
    private prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

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
    const value = this.normalizeBlacklistValue(type, input.value);
    if (!value) throw new Error('Valeur blacklist requise');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    const active = input.active !== false;
    const row = await this.prisma.blacklistEntry.upsert({
      where: { type_value: { type, value } },
      create: {
        type,
        value,
        reason: input.reason.trim() || 'Sans motif',
        expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        createdBy: input.createdBy ?? null,
        active,
      },
      update: {
        reason: input.reason.trim() || 'Sans motif',
        expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        active,
        createdBy: input.createdBy ?? undefined,
      },
    });
    if (active) {
      await this.revokeSessionsForBlacklistEntry(type, value);
    }
    return row;
  }

  /** Normalize PHONE to +243… so JWT/OTP checks match User.phone. */
  normalizeBlacklistValue(type: BlacklistType, raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (type === BlacklistType.PHONE) {
      return normalizePhoneRdc(trimmed) || trimmed.toLowerCase();
    }
    return trimmed.toLowerCase();
  }

  /** Coupe immédiatement les sessions JWT des comptes touchés. */
  async revokeSessionsForBlacklistEntry(type: BlacklistType, value: string) {
    if (!this.redis) return;
    const ids = new Set<string>();
    if (type === BlacklistType.USER_ID) {
      ids.add(value);
    } else if (type === BlacklistType.PHONE) {
      const users = await this.prisma.user.findMany({
        where: { phone: value },
        select: { id: true },
      });
      for (const u of users) ids.add(u.id);
    } else if (type === BlacklistType.EMAIL) {
      const users = await this.prisma.user.findMany({
        where: { email: { equals: value, mode: 'insensitive' } },
        select: { id: true },
      });
      for (const u of users) ids.add(u.id);
    }
    for (const id of ids) {
      await denyJwtUser(this.redis, id).catch(() => undefined);
    }
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
      const phone = this.normalizeBlacklistValue(BlacklistType.PHONE, opts.phone);
      or.push({ type: BlacklistType.PHONE, value: phone });
      // Entrées historiques saisies sans normalisation.
      const raw = opts.phone.trim().toLowerCase();
      if (raw && raw !== phone) {
        or.push({ type: BlacklistType.PHONE, value: raw });
      }
    }
    if (opts.email?.trim()) {
      or.push({
        type: BlacklistType.EMAIL,
        value: this.normalizeBlacklistValue(BlacklistType.EMAIL, opts.email),
      });
    }
    if (opts.userId?.trim()) {
      or.push({
        type: BlacklistType.USER_ID,
        value: this.normalizeBlacklistValue(BlacklistType.USER_ID, opts.userId),
      });
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
