import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { INTERNAL_API_KEY, notifyAuthUser, serviceUrl } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

export type PlatformVendorInput = {
  name: string;
  provider: string;
  category?: string;
  amountUsd?: number | null;
  billingCycle?: string | null;
  nextPaymentAt?: string | null;
  expiresAt?: string | null;
  alertDaysBefore?: number;
  notifyEnabled?: boolean;
  notes?: string | null;
  url?: string | null;
};

const DEFAULT_VENDORS: PlatformVendorInput[] = [
  {
    name: 'Render — API & front SENGA',
    provider: 'Render',
    category: 'hosting',
    billingCycle: 'monthly',
    alertDaysBefore: 7,
    notes: 'Microservices + admin / partenaires. Surveiller facturation Render.',
    url: 'https://dashboard.render.com',
  },
  {
    name: 'Google Play — Senga & SENGA Driver',
    provider: 'Google Play',
    category: 'store',
    billingCycle: 'yearly',
    alertDaysBefore: 30,
    notes: 'Compte développeur Google (frais annuels).',
    url: 'https://play.google.com/console',
  },
  {
    name: 'AfriSoft Pay — Mobile Money',
    provider: 'AfriSoft Pay',
    category: 'payments',
    billingCycle: 'monthly',
    alertDaysBefore: 7,
    url: 'https://pay.afri-soft.com',
  },
  {
    name: 'AfriSoft SMS — OTP',
    provider: 'AfriSoft SMS',
    category: 'sms',
    billingCycle: 'monthly',
    alertDaysBefore: 7,
  },
  {
    name: 'Domaine afri-soft.com / API',
    provider: 'Registrar DNS',
    category: 'domain',
    billingCycle: 'yearly',
    alertDaysBefore: 30,
  },
  {
    name: 'Firebase / FCM push',
    provider: 'Google Firebase',
    category: 'other',
    billingCycle: 'monthly',
    alertDaysBefore: 14,
  },
];

function parseDate(value?: string | null): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntil(date: Date | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const ms = date.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

@Injectable()
export class PlatformVendorsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformVendorsService.name);
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    void this.ensureDefaults().catch((e) =>
      this.logger.warn(`platform vendors seed: ${(e as Error).message}`),
    );
    // Toutes les 6 h — alertes Super Admin avant échéance.
    this.timer = setInterval(() => void this.runExpiryAlerts(), 6 * 60 * 60 * 1000);
    setTimeout(() => void this.runExpiryAlerts(), 45_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async ensureDefaults() {
    const count = await this.prisma.platformVendor.count();
    if (count > 0) return;
    for (const v of DEFAULT_VENDORS) {
      await this.prisma.platformVendor.create({
        data: {
          id: randomUUID(),
          name: v.name,
          provider: v.provider,
          category: v.category ?? 'other',
          amountUsd: v.amountUsd ?? null,
          billingCycle: v.billingCycle ?? null,
          nextPaymentAt: parseDate(v.nextPaymentAt ?? null),
          expiresAt: parseDate(v.expiresAt ?? null),
          alertDaysBefore: v.alertDaysBefore ?? 14,
          notifyEnabled: v.notifyEnabled !== false,
          notes: v.notes ?? null,
          url: v.url ?? null,
        },
      });
    }
    this.logger.log(`Seeded ${DEFAULT_VENDORS.length} platform vendor rows`);
  }

  private serialize(row: {
    id: string;
    name: string;
    provider: string;
    category: string;
    amountUsd: number | null;
    billingCycle: string | null;
    nextPaymentAt: Date | null;
    expiresAt: Date | null;
    alertDaysBefore: number;
    notifyEnabled: boolean;
    notes: string | null;
    url: string | null;
    lastAlertedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const now = new Date();
    const payDays = daysUntil(row.nextPaymentAt, now);
    const expDays = daysUntil(row.expiresAt, now);
    const soonest =
      [payDays, expDays].filter((d): d is number => d != null).sort((a, b) => a - b)[0] ?? null;
    const urgent = soonest != null && soonest <= row.alertDaysBefore;
    const overdue = soonest != null && soonest < 0;
    return {
      ...row,
      nextPaymentAt: row.nextPaymentAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      lastAlertedAt: row.lastAlertedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      daysUntilPayment: payDays,
      daysUntilExpiry: expDays,
      daysUntilSoonest: soonest,
      urgent,
      overdue,
    };
  }

  async list() {
    const rows = await this.prisma.platformVendor.findMany({ orderBy: [{ name: 'asc' }] });
    return rows.map((r) => this.serialize(r)).sort((a, b) => {
      const da = a.daysUntilSoonest ?? 9999;
      const db = b.daysUntilSoonest ?? 9999;
      return da - db;
    });
  }

  async create(input: PlatformVendorInput) {
    const row = await this.prisma.platformVendor.create({
      data: {
        name: input.name.trim(),
        provider: input.provider.trim(),
        category: (input.category ?? 'other').trim() || 'other',
        amountUsd: input.amountUsd ?? null,
        billingCycle: input.billingCycle ?? null,
        nextPaymentAt: parseDate(input.nextPaymentAt ?? null),
        expiresAt: parseDate(input.expiresAt ?? null),
        alertDaysBefore: Math.max(1, Math.floor(input.alertDaysBefore ?? 14)),
        notifyEnabled: input.notifyEnabled !== false,
        notes: input.notes?.trim() || null,
        url: input.url?.trim() || null,
      },
    });
    return this.serialize(row);
  }

  async update(id: string, input: Partial<PlatformVendorInput>) {
    const row = await this.prisma.platformVendor.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.provider !== undefined ? { provider: input.provider.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category.trim() || 'other' } : {}),
        ...(input.amountUsd !== undefined ? { amountUsd: input.amountUsd } : {}),
        ...(input.billingCycle !== undefined ? { billingCycle: input.billingCycle } : {}),
        ...(input.nextPaymentAt !== undefined
          ? { nextPaymentAt: parseDate(input.nextPaymentAt) }
          : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: parseDate(input.expiresAt) } : {}),
        ...(input.alertDaysBefore !== undefined
          ? { alertDaysBefore: Math.max(1, Math.floor(input.alertDaysBefore)) }
          : {}),
        ...(input.notifyEnabled !== undefined ? { notifyEnabled: input.notifyEnabled === true } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.url !== undefined ? { url: input.url?.trim() || null } : {}),
      },
    });
    return this.serialize(row);
  }

  async remove(id: string) {
    await this.prisma.platformVendor.delete({ where: { id } });
    return { deleted: true, id };
  }

  async runExpiryAlerts() {
    const rows = await this.prisma.platformVendor.findMany({ where: { notifyEnabled: true } });
    const now = new Date();
    const due = rows.filter((row) => {
      const soonest = [daysUntil(row.nextPaymentAt, now), daysUntil(row.expiresAt, now)]
        .filter((d): d is number => d != null)
        .sort((a, b) => a - b)[0];
      if (soonest == null || soonest > row.alertDaysBefore) return false;
      if (row.lastAlertedAt) {
        const hours = (now.getTime() - row.lastAlertedAt.getTime()) / (60 * 60 * 1000);
        if (hours < 20) return false;
      }
      return true;
    });
    if (!due.length) return { alerted: 0 };

    const staff = await this.fetchSuperAdmins();
    if (!staff.length) {
      this.logger.warn('No SUPER_ADMIN to alert for platform vendor expiry');
      return { alerted: 0 };
    }

    let alerted = 0;
    for (const row of due) {
      const payDays = daysUntil(row.nextPaymentAt, now);
      const expDays = daysUntil(row.expiresAt, now);
      const lines = [
        `SENGA — échéance plateforme : ${row.name} (${row.provider})`,
        payDays != null ? `Prochain paiement : dans ${payDays} j` : null,
        expDays != null ? `Expiration : dans ${expDays} j` : null,
        row.amountUsd != null ? `Montant indicatif : ${row.amountUsd} USD` : null,
        row.notes ? `Note : ${row.notes}` : null,
        'Action : renouveler à temps pour éviter une interruption de service.',
      ].filter(Boolean) as string[];
      const text = lines.join('\n');
      for (const admin of staff) {
        await notifyAuthUser(admin.id, {
          smsText: text.slice(0, 300),
          emailSubject: `[SENGA] Échéance ${row.name}`,
          emailText: text,
          emailHtml: `<pre style="font-family:sans-serif">${text.replace(/</g, '&lt;')}</pre>`,
          purpose: 'platform_vendor_expiry',
        }).catch((e) => this.logger.warn(`notify ${admin.id}: ${(e as Error).message}`));
      }
      await this.prisma.platformVendor.update({
        where: { id: row.id },
        data: { lastAlertedAt: now },
      });
      alerted += 1;
    }
    this.logger.log(`Platform vendor alerts sent for ${alerted} item(s)`);
    return { alerted };
  }

  private async fetchSuperAdmins(): Promise<{ id: string; phone?: string | null }[]> {
    try {
      const res = await fetch(serviceUrl('auth', '/internal/users/ops-staff'), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return [];
      const rows = (await res.json()) as { id: string; role?: string; phone?: string | null }[];
      return rows.filter((r) => r.role === 'SUPER_ADMIN');
    } catch {
      return [];
    }
  }
}
