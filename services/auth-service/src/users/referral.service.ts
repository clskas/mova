import { HttpStatus, Injectable } from '@nestjs/common';
import { fetchAutomations, MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A short code anyone can type (no 0/O, 1/I). */
export function makeReferralCode(seed: number): string {
  let n = Math.abs(Math.floor(seed)) || 1;
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[n % ALPHABET.length];
    n = Math.floor(n / ALPHABET.length) + (i + 7) * 7919;
  }
  return `SG${out}`;
}

/**
 * Referral: every user has a code to share; a new user enters a friend's code within the first
 * days; both get a SENGA credit once the new user finishes a first ride or delivery (paid by
 * ride-service's automations). Switch and amounts: Admin → Automatisations.
 */
@Injectable()
export class ReferralService {
  constructor(private prisma: PrismaService) {}

  private async ensureCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
    if (user?.referralCode) return user.referralCode;
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = makeReferralCode(Date.now() + Math.random() * 1e9 + attempt);
      try {
        await this.prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
        return code;
      } catch {
        /* code taken: try again */
      }
    }
    throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.CONFLICT, 'Code de parrainage indisponible, réessayez.');
  }

  async mine(userId: string) {
    const cfg = (await fetchAutomations()).referral;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, referredById: true },
    });
    if (!user) throw new MovaHttpException(MovaErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    const [invited, rewarded] = await Promise.all([
      this.prisma.user.count({ where: { referredById: userId } }),
      this.prisma.user.count({ where: { referredById: userId, referralRewardedAt: { not: null } } }),
    ]);
    const canEnterCode =
      cfg.enabled && !user.referredById && Date.now() - user.createdAt.getTime() < cfg.codeEntryDays * 24 * 3600 * 1000;
    return {
      enabled: cfg.enabled,
      code: cfg.enabled ? await this.ensureCode(userId) : null,
      referrerRewardCdf: cfg.referrerRewardCdf,
      refereeRewardCdf: cfg.refereeRewardCdf,
      invited,
      rewarded,
      canEnterCode,
      codeEntryDays: cfg.codeEntryDays,
      hasReferrer: Boolean(user.referredById),
    };
  }

  async applyCode(userId: string, rawCode: string) {
    const cfg = (await fetchAutomations()).referral;
    const fail = (msg: string) => new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, msg);
    if (!cfg.enabled) throw fail('Le parrainage n’est pas ouvert pour le moment.');
    const code = String(rawCode ?? '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code) throw fail('Saisissez le code de votre parrain.');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true, referredById: true, referralCode: true } });
    if (!user) throw new MovaHttpException(MovaErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (user.referredById) throw fail('Vous avez déjà un parrain.');
    if (Date.now() - user.createdAt.getTime() > cfg.codeEntryDays * 24 * 3600 * 1000) {
      throw fail(`Le code se saisit dans les ${cfg.codeEntryDays} jours qui suivent l’inscription.`);
    }
    const referrer = await this.prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!referrer) throw fail('Code de parrainage inconnu.');
    if (referrer.id === userId) throw fail('Vous ne pouvez pas utiliser votre propre code.');
    await this.prisma.user.update({ where: { id: userId }, data: { referredById: referrer.id, referredAt: new Date() } });
    return this.mine(userId);
  }

  /** Referrals waiting for the first ride, the referrer not over the maximum. */
  async pending(maxPerReferrer: number) {
    const rows = await this.prisma.user.findMany({
      where: {
        referredById: { not: null },
        referralRewardedAt: null,
        referredAt: { gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) },
      },
      select: { id: true, referredById: true },
      take: 500,
    });
    const out: { userId: string; referrerId: string }[] = [];
    const counts = new Map<string, number>();
    for (const r of rows) {
      const ref = r.referredById!;
      if (!counts.has(ref)) {
        counts.set(ref, await this.prisma.user.count({ where: { referredById: ref, referralRewardedAt: { not: null } } }));
      }
      if ((counts.get(ref) ?? 0) >= maxPerReferrer) continue;
      out.push({ userId: r.id, referrerId: ref });
    }
    return { items: out };
  }

  async markRewarded(userId: string) {
    await this.prisma.user.updateMany({ where: { id: userId, referralRewardedAt: null }, data: { referralRewardedAt: new Date() } });
    return { ok: true };
  }
}
