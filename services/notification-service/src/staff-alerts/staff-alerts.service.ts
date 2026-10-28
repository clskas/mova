import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StaffAlertsService {
  constructor(private prisma: PrismaService) {}

  async create(input: {
    severity?: string;
    title: string;
    body: string;
    city?: string | null;
    href?: string | null;
    targetRole?: string | null;
  }) {
    return this.prisma.staffAlert.create({
      data: {
        severity: (input.severity ?? 'INFO').toUpperCase(),
        title: input.title.trim(),
        body: input.body.trim(),
        city: input.city?.trim() || null,
        href: input.href?.trim() || null,
        targetRole: input.targetRole?.trim() || null,
      },
    });
  }

  async list(opts?: {
    skip?: number;
    take?: number;
    unreadOnly?: boolean;
    city?: string;
    severity?: string;
  }) {
    const skip = Math.max(0, Number(opts?.skip ?? 0));
    const take = Math.min(200, Math.max(1, Number(opts?.take ?? 50)));
    const where: {
      readAt?: null;
      city?: { equals: string; mode: 'insensitive' };
      severity?: string;
    } = {};
    if (opts?.unreadOnly) where.readAt = null;
    if (opts?.city?.trim()) where.city = { equals: opts.city.trim(), mode: 'insensitive' };
    if (opts?.severity?.trim()) where.severity = opts.severity.trim().toUpperCase();
    const [data, total, unread] = await Promise.all([
      this.prisma.staffAlert.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.staffAlert.count({ where }),
      this.prisma.staffAlert.count({ where: { readAt: null } }),
    ]);
    return { data, total, unread, skip, take };
  }

  async markRead(id: string) {
    return this.prisma.staffAlert.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead() {
    const result = await this.prisma.staffAlert.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
