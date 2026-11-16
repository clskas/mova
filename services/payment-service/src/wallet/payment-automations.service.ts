import { Body, Controller, Get, HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit, Post, Request, UseGuards } from '@nestjs/common';
import {
  INTERNAL_API_KEY,
  MOVA_EVENTS,
  MovaErrorCode,
  MovaHttpException,
  RedisService,
  fetchAutomations,
  formatCdf,
  kinshasaClock,
  operatorDegraded,
  postStaffAlert,
  serviceUrl,
  type PaymentReminderPayload,
  runClusterTick,
} from '@mova/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

const MIN = 60 * 1000;
/** Operator currently failing (read by /public/client-config through the same Redis). */
export const mmDegradedKey = (provider: string) => `mm:degraded:${provider.toUpperCase()}`;
const PROVIDERS = ['MPESA', 'AIRTEL_MONEY', 'ORANGE_MONEY', 'AFRIMONEY'];

/** Provider named in « Recharge M-Pesa en attente » (pure, tested). */
export function providerOfPendingTopup(description: string | null | undefined): string | null {
  const d = String(description ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (d.includes('MPESA')) return 'MPESA';
  if (d.includes('AIRTEL')) return 'AIRTEL_MONEY';
  if (d.includes('ORANGE')) return 'ORANGE_MONEY';
  if (d.includes('AFRIMONEY')) return 'AFRIMONEY';
  return null;
}

/**
 * Money automations (Admin → Automatisations): nightly top-up check, operator watch,
 * weekly payouts to the driver's own number, monthly statements.
 */
@Injectable()
export class PaymentAutomationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentAutomationsService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private prisma: PrismaService, private redis: RedisService, private wallet: WalletService) {}

  onModuleInit() {
    if (process.env.AUTOMATIONS_DISABLED === 'true' || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void runClusterTick(this.redis, 'payment-automations', 10 * MIN, () => this.tick()), 10 * MIN);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async once(key: string, ttlSec: number) {
    try {
      return (await this.redis.client.set(key, '1', 'EX', ttlSec, 'NX')) === 'OK';
    } catch {
      return false;
    }
  }

  private async tell(userId: string, title: string, body: string) {
    await this.redis
      .publish(MOVA_EVENTS.PAYMENT_REMINDER, { userId, title, body, kind: 'AUTOMATION', sms: false } satisfies PaymentReminderPayload)
      .catch(() => undefined);
  }

  async tick() {
    const a = await fetchAutomations();
    const clock = kinshasaClock();
    const run = async (name: string, fn: () => Promise<unknown>) => fn().catch((e: unknown) => this.logger.warn(`${name}: ${String(e)}`));
    if (a.operatorWatch.enabled) await run('operators', () => this.operatorWatch(a.operatorWatch));
    if (a.ledgerCheck.enabled && clock.hour === 4 && (await this.once(`auto:ledger:${clock.day}`, 36 * 3600))) {
      await run('ledger', () => this.ledgerCheck());
    }
    const weekday = new Date(`${clock.day}T12:00:00+01:00`).getUTCDay();
    if (
      a.autoPayouts.enabled &&
      weekday === a.autoPayouts.weekday &&
      clock.hour === a.autoPayouts.hourKinshasa &&
      (await this.once(`auto:payouts:${clock.day}`, 36 * 3600))
    ) {
      await run('payouts', () => this.autoPayouts(a.autoPayouts.minCdf));
    }
    if (a.statements.enabled && clock.day.endsWith('-01') && clock.hour === 8 && (await this.once(`auto:statements:${clock.day}`, 36 * 3600))) {
      await run('statements', () => this.statements());
    }
  }

  /** Top-ups started 2 h – 26 h ago never credited: the customer may have paid. */
  async ledgerCheck() {
    const pending = await this.prisma.walletTransaction.findMany({
      where: { type: 'TOPUP_PENDING', createdAt: { gte: new Date(Date.now() - 26 * 60 * MIN), lte: new Date(Date.now() - 120 * MIN) } },
      select: { reference: true, amountCdf: true, description: true },
      take: 2000,
    });
    const refs = pending.map((p) => p.reference).filter(Boolean) as string[];
    const credited = new Set(
      (await this.prisma.walletTransaction.findMany({ where: { reference: { in: refs }, type: 'CREDIT' }, select: { reference: true } })).map((r) => r.reference),
    );
    const stuck = pending.filter((p) => p.reference && !credited.has(p.reference));
    if (!stuck.length) return;
    const total = stuck.reduce((s, p) => s + p.amountCdf, 0);
    await postStaffAlert({
      severity: 'WARNING',
      title: `${stuck.length} recharge(s) Mobile Money non créditée(s)`,
      body: `${formatCdf(total)} au total. À vérifier chez l'opérateur : ${stuck.slice(0, 10).map((s) => s.reference).join(', ')}`,
      href: '/portefeuille',
    });
  }

  /** Operators failing in the last hour: customers warned (client-config), team alerted. */
  async operatorWatch(cfg: { minAttempts: number; failRatePct: number }) {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { type: 'TOPUP_PENDING', createdAt: { gte: new Date(Date.now() - 60 * MIN), lte: new Date(Date.now() - 10 * MIN) } },
      select: { reference: true, description: true },
      take: 5000,
    });
    const refs = rows.map((r) => r.reference).filter(Boolean) as string[];
    const ok = new Set(
      (await this.prisma.walletTransaction.findMany({ where: { reference: { in: refs }, type: 'CREDIT' }, select: { reference: true } })).map((r) => r.reference),
    );
    for (const provider of PROVIDERS) {
      const mine = rows.filter((r) => providerOfPendingTopup(r.description) === provider);
      const succeeded = mine.filter((r) => r.reference && ok.has(r.reference)).length;
      if (!operatorDegraded(mine.length, succeeded, cfg)) continue;
      await this.redis.client.setex(mmDegradedKey(provider), 40 * 60, '1').catch(() => undefined);
      if (await this.once(`auto:mm-alert:${provider}:${Math.floor(Date.now() / (2 * 3_600_000))}`, 3 * 3600)) {
        await postStaffAlert({
          severity: 'CRITICAL',
          title: `Mobile Money : ${provider} en difficulté`,
          body: `${mine.length - succeeded}/${mine.length} recharges non abouties en 1 h. Les clients voient un avertissement dans l'app.`,
          href: '/plateformes',
        });
      }
    }
  }

  /** Weekly payout of the available balance to the driver's own number (opted-in drivers). */
  async autoPayouts(minCdf: number) {
    const settings = await this.prisma.autoPayoutSetting.findMany({ where: { enabled: true }, take: 5000 });
    for (const s of settings) {
      try {
        const w = (await this.wallet.getWallet(s.userId)) as { availableBalanceCdf?: number; balanceCdf: number };
        const available = Math.floor(Number(w.availableBalanceCdf ?? w.balanceCdf) || 0);
        if (available < minCdf) continue;
        const phone = await this.accountPhone(s.userId);
        if (!phone) continue;
        await this.wallet.withdrawToMobileMoney(s.userId, available, s.provider, phone, { accountPhone: phone, ownNumberWithoutOtp: true });
        await this.tell(s.userId, 'Paiement hebdomadaire envoyé', `${formatCdf(available)} envoyés sur votre ${s.provider} (${phone}).`);
      } catch (e) {
        this.logger.warn(`auto payout ${s.userId}: ${String(e)}`);
      }
    }
  }

  private async accountPhone(userId: string): Promise<string | null> {
    try {
      const res = await fetch(serviceUrl('auth', `/internal/users/${userId}`), { headers: { 'x-internal-api-key': INTERNAL_API_KEY } });
      return res.ok ? (((await res.json()) as { phone?: string }).phone ?? null) : null;
    } catch {
      return null;
    }
  }

  /** 1st of the month: income of last month to each driver; companies' totals to the team. */
  async statements() {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const month = from.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const rows = await this.prisma.walletTransaction.groupBy({
      by: ['walletId'],
      where: { type: 'CREDIT', reference: { contains: '_PAYOUT:' }, createdAt: { gte: from, lt: to } },
      _sum: { amountCdf: true },
      _count: { _all: true },
    });
    const wallets = await this.prisma.wallet.findMany({ where: { id: { in: rows.map((r) => r.walletId) } }, select: { id: true, userId: true } });
    const userOf = new Map(wallets.map((w) => [w.id, w.userId]));
    for (const r of rows) {
      const userId = userOf.get(r.walletId);
      if (!userId) continue;
      await this.tell(userId, `Vos revenus de ${month}`, `${formatCdf(r._sum.amountCdf ?? 0)} gagnés sur ${r._count._all} missions SENGA. Détail dans votre portefeuille.`);
    }
    const corps = await this.prisma.walletTransaction.groupBy({
      by: ['walletId'],
      where: { wallet: { userId: { startsWith: 'corp:' } }, type: 'DEBIT', createdAt: { gte: from, lt: to } },
      _sum: { amountCdf: true },
    });
    if (corps.length) {
      const total = corps.reduce((s, c) => s + Math.abs(c._sum.amountCdf ?? 0), 0);
      await postStaffAlert({
        severity: 'INFO',
        title: `Relevés entreprises de ${month}`,
        body: `${corps.length} entreprise(s), ${formatCdf(total)} de courses à facturer. Détail dans Comptes entreprises.`,
        href: '/entreprises',
      });
    }
  }
}

/** Driver: weekly payout to his own Mobile Money number (Automatisations → Paiement automatique). */
@Controller('wallet/auto-payout')
@UseGuards(JwtAuthGuard)
export class AutoPayoutController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async get(@Request() req: { user: { id: string } }) {
    const cfg = (await fetchAutomations()).autoPayouts;
    const s = await this.prisma.autoPayoutSetting.findUnique({ where: { userId: req.user.id } });
    return { available: cfg.enabled, minCdf: cfg.minCdf, weekday: cfg.weekday, enabled: s?.enabled ?? false, provider: s?.provider ?? null };
  }

  @Post()
  async set(@Request() req: { user: { id: string; role?: string } }, @Body() body: { enabled?: boolean; provider?: string }) {
    if (String(req.user.role ?? '').toUpperCase() !== 'DRIVER') {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN, 'Réservé aux chauffeurs et livreurs.');
    }
    const cfg = (await fetchAutomations()).autoPayouts;
    if (!cfg.enabled) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Le paiement automatique n’est pas activé.');
    const provider = String(body?.provider ?? '').toUpperCase();
    if (body?.enabled && !PROVIDERS.includes(provider)) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Choisissez votre opérateur Mobile Money.');
    }
    const enabled = body?.enabled === true;
    const row = await this.prisma.autoPayoutSetting.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, enabled, provider: provider || 'MPESA' },
      update: { enabled, ...(provider ? { provider } : {}) },
    });
    return { success: true, enabled: row.enabled, provider: row.provider };
  }
}
