import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { INTERNAL_API_KEY, MovaErrorCode, MovaHttpException, fetchAutomations, formatCdf, loyaltyPointsFor, serviceUrl } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

/** Tips (100 % for the driver) and loyalty points (Automatisations). */
@Injectable()
export class GrowthService {
  private readonly logger = new Logger(GrowthService.name);

  constructor(private prisma: PrismaService, private wallet: WalletService) {}

  // ---------- Tips ----------
  async tipConfig() {
    const t = (await fetchAutomations()).tips;
    return { enabled: t.enabled, presetsCdf: t.presetsCdf, maxCdf: t.maxCdf };
  }

  /** Tip after a completed ride: from the passenger's wallet to the driver, once per ride. */
  async tip(userId: string, rideId: string, amountCdf: number) {
    const cfg = (await fetchAutomations()).tips;
    if (!cfg.enabled) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Le pourboire n’est pas activé.');
    const amount = Math.round(Number(amountCdf));
    if (!Number.isInteger(amount) || amount < 100 || amount > cfg.maxCdf) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, `Pourboire entre 100 FC et ${formatCdf(cfg.maxCdf)}.`);
    }
    const ride = await this.fetchRide(rideId);
    if (!ride || ride.passengerId !== userId) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (String(ride.status).toUpperCase() !== 'COMPLETED' || !ride.driverId) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Le pourboire se donne après une course terminée.');
    }
    const ref = `TIP:${rideId}`;
    const already = await this.prisma.walletTransaction.findFirst({ where: { reference: ref, type: 'DEBIT' } });
    if (already) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.CONFLICT, 'Vous avez déjà donné un pourboire pour cette course.');
    await this.wallet.debit(userId, amount, `Pourboire chauffeur — course ${rideId.slice(0, 8)}`, ref);
    await this.wallet.credit(ride.driverId, amount, `Pourboire reçu — course ${rideId.slice(0, 8)}`, ref);
    return { success: true, amountCdf: amount, message: `Merci ! ${formatCdf(amount)} envoyés à votre chauffeur.` };
  }

  private async fetchRide(rideId: string): Promise<{ passengerId?: string; driverId?: string | null; status?: string } | null> {
    try {
      const res = await fetch(serviceUrl('ride', `/internal/rides/${rideId}`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? ((await res.json()) as { passengerId?: string; driverId?: string | null; status?: string }) : null;
    } catch {
      return null;
    }
  }

  // ---------- Loyalty ----------
  /** Points for a payment (once per reference). Never throws. */
  async awardLoyalty(userId: string | undefined, paidCdf: number, reference: string) {
    try {
      if (!userId || !(paidCdf > 0)) return;
      const cfg = (await fetchAutomations()).loyalty;
      if (!cfg.enabled) return;
      const points = loyaltyPointsFor(paidCdf, cfg.pointsPer1000Cdf);
      if (points <= 0) return;
      await this.prisma.$transaction(async (tx) => {
        await tx.loyaltyEvent.create({ data: { userId, points, reason: 'EARN', reference: `LOYALTY:${reference}` } });
        await tx.loyaltyAccount.upsert({
          where: { userId },
          create: { userId, points },
          update: { points: { increment: points } },
        });
      });
    } catch (e) {
      // Unique reference = already awarded.
      if (!String((e as { code?: string })?.code ?? '').includes('P2002')) this.logger.warn(`loyalty: ${String(e)}`);
    }
  }

  async loyalty(userId: string) {
    const cfg = (await fetchAutomations()).loyalty;
    const acc = await this.prisma.loyaltyAccount.findUnique({ where: { userId } });
    const history = await this.prisma.loyaltyEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return {
      enabled: cfg.enabled,
      points: acc?.points ?? 0,
      pointsPer1000Cdf: cfg.pointsPer1000Cdf,
      redeemPoints: cfg.redeemPoints,
      redeemValueCdf: cfg.redeemValueCdf,
      canRedeem: cfg.enabled && (acc?.points ?? 0) >= cfg.redeemPoints,
      history,
    };
  }

  /** Converts redeemPoints points into a wallet credit paid by SENGA. */
  async redeem(userId: string) {
    const cfg = (await fetchAutomations()).loyalty;
    if (!cfg.enabled) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Les points de fidélité ne sont pas activés.');
    const reference = `LOYALTY_REDEEM:${userId}:${Date.now()}`;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.loyaltyAccount.updateMany({
        where: { userId, points: { gte: cfg.redeemPoints } },
        data: { points: { decrement: cfg.redeemPoints } },
      });
      if (updated.count !== 1) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, `Il faut ${cfg.redeemPoints} points pour un crédit.`);
      }
      await tx.loyaltyEvent.create({ data: { userId, points: -cfg.redeemPoints, reason: 'REDEEM', reference } });
    });
    await this.wallet.grantPlatformBonus(userId, cfg.redeemValueCdf, `Points de fidélité SENGA (${cfg.redeemPoints} points)`, reference);
    return { success: true, creditedCdf: cfg.redeemValueCdf, message: `${formatCdf(cfg.redeemValueCdf)} ajoutés à votre portefeuille.` };
  }
}
