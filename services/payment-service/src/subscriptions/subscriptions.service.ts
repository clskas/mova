import { randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { SubscriptionStatus, SubscriptionTarget } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, formatCdf } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
  ) {}

  listPlans(activeOnly = false) {
    return this.prisma.subscriptionPlan.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { monthlyPriceCdf: 'asc' },
    });
  }

  async getPlan(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new MovaHttpException(MovaErrorCode.SUBSCRIPTION_NOT_FOUND, HttpStatus.NOT_FOUND);
    return plan;
  }

  async createPlan(data: {
    code: string;
    name: string;
    target: SubscriptionTarget;
    monthlyPriceCdf: number;
    feeReductionPercent?: number;
    priorityMatching?: boolean;
    description?: string;
  }) {
    return this.prisma.subscriptionPlan.create({
      data: {
        code: data.code.trim().toUpperCase(),
        name: data.name.trim(),
        target: data.target,
        monthlyPriceCdf: data.monthlyPriceCdf,
        feeReductionPercent: data.feeReductionPercent ?? 0,
        priorityMatching: data.priorityMatching ?? false,
        description: data.description,
      },
    });
  }

  async updatePlan(
    id: string,
    data: Partial<{
      name: string;
      monthlyPriceCdf: number;
      feeReductionPercent: number;
      priorityMatching: boolean;
      description: string;
      isActive: boolean;
    }>,
  ) {
    await this.getPlan(id);
    return this.prisma.subscriptionPlan.update({ where: { id }, data });
  }

  listSubscribers(query: { planId?: string; status?: SubscriptionStatus; skip?: number; take?: number }) {
    const where: { planId?: string; status?: SubscriptionStatus } = {};
    if (query.planId) where.planId = query.planId;
    if (query.status) where.status = query.status;
    return this.prisma.userSubscription.findMany({
      where,
      include: { plan: true },
      skip: query.skip ?? 0,
      take: query.take ?? 50,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Marks subscriptions past their end date as EXPIRED (one month per payment). */
  private async expireEnded(userId: string) {
    await this.prisma.userSubscription.updateMany({
      where: { userId, status: SubscriptionStatus.ACTIVE, endsAt: { lte: new Date() } },
      data: { status: SubscriptionStatus.EXPIRED },
    });
  }

  /** Drivers whose active plan gives priority in dispatch. */
  async priorityDriverIds(): Promise<string[]> {
    const rows = await this.prisma.userSubscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE, endsAt: { gt: new Date() }, plan: { target: SubscriptionTarget.DRIVER, priorityMatching: true } },
      select: { userId: true },
      take: 5000,
    });
    return [...new Set(rows.map((r) => r.userId))];
  }

  /**
   * Renewal (Admin → Automatisations → SENGA Plus): reminder N days before the end, and when
   * auto-renewal is on, a new month paid from the wallet just before the end.
   */
  async renewDue(opts: { autoRenew: boolean; remindDaysBefore: number }, notify: (userId: string, title: string, body: string) => Promise<void>) {
    const now = Date.now();
    const soon = await this.prisma.userSubscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE, endsAt: { gt: new Date(now), lte: new Date(now + Math.max(1, opts.remindDaysBefore) * 86_400_000) } },
      include: { plan: true },
      take: 2000,
    });
    let renewed = 0;
    for (const s of soon) {
      const endsAt = s.endsAt!;
      const hoursLeft = (endsAt.getTime() - now) / 3_600_000;
      if (opts.autoRenew && hoursLeft <= 12 && s.plan.isActive) {
        const ref = `RENEW:${s.id}:${endsAt.toISOString().slice(0, 10)}`;
        try {
          await this.wallet.debit(s.userId, s.plan.monthlyPriceCdf, `Renouvellement ${s.plan.name}`, ref);
          const next = new Date(endsAt);
          next.setMonth(next.getMonth() + 1);
          await this.prisma.userSubscription.update({ where: { id: s.id }, data: { endsAt: next } });
          await notify(s.userId, 'Abonnement renouvelé', `${s.plan.name} est renouvelé jusqu’au ${next.toLocaleDateString('fr-FR')} (${formatCdf(s.plan.monthlyPriceCdf)}).`);
          renewed++;
        } catch {
          await notify(s.userId, 'Abonnement à renouveler', `Solde insuffisant pour renouveler ${s.plan.name} (${formatCdf(s.plan.monthlyPriceCdf)}). Rechargez votre portefeuille avant le ${endsAt.toLocaleDateString('fr-FR')}.`);
        }
      } else if (hoursLeft > 12) {
        await notify(
          s.userId,
          'Votre abonnement se termine bientôt',
          opts.autoRenew
            ? `${s.plan.name} sera renouvelé le ${endsAt.toLocaleDateString('fr-FR')} (${formatCdf(s.plan.monthlyPriceCdf)}) : gardez ce montant sur votre portefeuille.`
            : `${s.plan.name} se termine le ${endsAt.toLocaleDateString('fr-FR')}.`,
        );
      }
    }
    return renewed;
  }

  async getActiveSubscription(userId: string, target?: SubscriptionTarget) {
    await this.expireEnded(userId);
    const subs = await this.prisma.userSubscription.findMany({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      include: { plan: true },
    });
    return subs.find((s) => !target || s.plan.target === target) ?? null;
  }

  async subscribe(userId: string, planId: string) {
    const plan = await this.getPlan(planId);
    if (!plan.isActive) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Ce plan n\'est plus disponible.');
    }
    await this.expireEnded(userId);
    const endsAt = new Date();
    endsAt.setMonth(endsAt.getMonth() + 1);
    // One reference per subscription: a fixed one let every later subscription through
    // without any debit (the wallet treats a known reference as already paid).
    const subscribeRef = `SUBSCRIBE:${userId}:${plan.target}:${randomUUID()}`;
    const sub = await this.prisma.$transaction(async (tx) => {
      // Debit first: it locks the wallet row, so a concurrent subscribe waits here and then
      // sees the subscription created by the first one (and rolls back its debit).
      await this.wallet.debit(userId, plan.monthlyPriceCdf, `Abonnement ${plan.name}`, subscribeRef, tx);
      const existing = await tx.userSubscription.findFirst({
        where: { userId, status: SubscriptionStatus.ACTIVE, plan: { target: plan.target } },
      });
      if (existing) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          HttpStatus.CONFLICT,
          'Vous avez déjà un abonnement actif pour ce profil.',
        );
      }
      return tx.userSubscription.create({
        data: {
          userId,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          endsAt,
        },
        include: { plan: true },
      });
    });
    return {
      subscription: sub,
      message: `Abonnement ${plan.name} activé pour ${formatCdf(plan.monthlyPriceCdf)} / mois.`,
    };
  }

  async cancel(userId: string) {
    const sub = await this.getActiveSubscription(userId);
    if (!sub) {
      throw new MovaHttpException(MovaErrorCode.SUBSCRIPTION_NOT_FOUND, HttpStatus.NOT_FOUND, 'Aucun abonnement actif.');
    }
    const updated = await this.prisma.userSubscription.update({
      where: { id: sub.id },
      data: { status: SubscriptionStatus.CANCELLED, endsAt: new Date() },
      include: { plan: true },
    });
    return {
      subscription: updated,
      success: true,
      message: `Abonnement ${updated.plan.name} annulé.`,
    };
  }
}
