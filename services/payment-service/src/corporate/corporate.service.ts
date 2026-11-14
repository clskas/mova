import { HttpStatus, Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { fetchAutomations, formatCdf, MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

/** The company's own wallet (what it owes SENGA appears as a negative balance). */
export const corporateWalletUserId = (accountId: string) => `corp:${accountId}`;

/** Can the company pay this amount without going past its credit limit? (pure, tested) */
export function corporateCanPay(balanceCdf: number, amountCdf: number, creditLimitCdf: number): boolean {
  return balanceCdf - amountCdf >= -Math.max(0, creditLimitCdf);
}

/**
 * Company accounts (Admin → Comptes entreprises, switch in Admin → Automatisations): members'
 * rides are charged to the company, which pays SENGA from a monthly statement.
 */
@Injectable()
export class CorporateService {
  constructor(private prisma: PrismaService, private wallet: WalletService) {}

  private fail(msg: string, status = HttpStatus.BAD_REQUEST) {
    return new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, status, msg);
  }

  private monthStart(): Date {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }

  async list() {
    const accounts = await this.prisma.corporateAccount.findMany({
      include: { members: { where: { isActive: true }, select: { userId: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const since = this.monthStart();
    return Promise.all(
      accounts.map(async (a) => {
        const w = await this.prisma.wallet.findUnique({ where: { userId: corporateWalletUserId(a.id) } });
        const usage = await this.prisma.payment.aggregate({
          where: { method: PaymentMethod.CORPORATE, status: PaymentStatus.COMPLETED, createdAt: { gte: since }, userId: { in: a.members.map((m) => m.userId) } },
          _sum: { amountCdf: true },
          _count: { _all: true },
        });
        return {
          id: a.id,
          name: a.name,
          contactName: a.contactName,
          contactPhone: a.contactPhone,
          contactEmail: a.contactEmail,
          creditLimitCdf: a.creditLimitCdf,
          isActive: a.isActive,
          membersCount: a.members.length,
          owedCdf: Math.max(0, -(w?.balanceCdf ?? 0)),
          monthRides: usage._count._all,
          monthUsageCdf: usage._sum.amountCdf ?? 0,
        };
      }),
    );
  }

  async create(data: { name?: string; contactName?: string; contactPhone?: string; contactEmail?: string; creditLimitCdf?: number }) {
    const name = String(data.name ?? '').trim();
    if (!name) throw this.fail('Nom de l’entreprise requis.');
    const a = await this.prisma.corporateAccount.create({
      data: {
        name,
        contactName: data.contactName?.trim() || null,
        contactPhone: data.contactPhone?.trim() || null,
        contactEmail: data.contactEmail?.trim() || null,
        creditLimitCdf: Math.max(0, Math.round(Number(data.creditLimitCdf ?? 500000))),
      },
    });
    await this.wallet.createWallet(corporateWalletUserId(a.id));
    return a;
  }

  async update(id: string, data: { name?: string; creditLimitCdf?: number; isActive?: boolean; contactName?: string; contactPhone?: string; contactEmail?: string }) {
    return this.prisma.corporateAccount.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: String(data.name).trim() } : {}),
        ...(data.creditLimitCdf !== undefined ? { creditLimitCdf: Math.max(0, Math.round(Number(data.creditLimitCdf))) } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive === true } : {}),
        ...(data.contactName !== undefined ? { contactName: data.contactName || null } : {}),
        ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone || null } : {}),
        ...(data.contactEmail !== undefined ? { contactEmail: data.contactEmail || null } : {}),
      },
    });
  }

  async members(accountId: string) {
    return this.prisma.corporateMember.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' } });
  }

  async addMember(accountId: string, userId: string, label?: string) {
    if (!userId) throw this.fail('Compte introuvable.');
    const other = await this.prisma.corporateMember.findUnique({ where: { userId } });
    if (other && other.accountId !== accountId) throw this.fail('Cette personne est déjà membre d’une autre entreprise.');
    return this.prisma.corporateMember.upsert({
      where: { userId },
      create: { accountId, userId, label: label?.trim() || null },
      update: { isActive: true, label: label?.trim() || null },
    });
  }

  async removeMember(memberId: string) {
    return this.prisma.corporateMember.update({ where: { id: memberId }, data: { isActive: false } });
  }

  /** The company paid its statement: its wallet is credited (debt reduced). */
  async settle(accountId: string, amountCdf: number, note?: string) {
    const amount = Math.round(Number(amountCdf));
    if (!Number.isFinite(amount) || amount <= 0) throw this.fail('Montant invalide.');
    await this.wallet.createWallet(corporateWalletUserId(accountId));
    await this.wallet.credit(corporateWalletUserId(accountId), amount, `Règlement entreprise${note ? ` — ${note}` : ''}`, `CORP_SETTLE:${accountId}:${Date.now()}`);
    return { ok: true, message: `Règlement de ${formatCdf(amount)} enregistré.` };
  }

  async statement(accountId: string) {
    const members = await this.prisma.corporateMember.findMany({ where: { accountId }, select: { userId: true, label: true } });
    const since = this.monthStart();
    const rows = await this.prisma.payment.findMany({
      where: { method: PaymentMethod.CORPORATE, status: PaymentStatus.COMPLETED, createdAt: { gte: since }, userId: { in: members.map((m) => m.userId) } },
      orderBy: { createdAt: 'desc' },
      select: { rideId: true, userId: true, amountCdf: true, createdAt: true },
      take: 1000,
    });
    const labels = new Map(members.map((m) => [m.userId, m.label]));
    return rows.map((r) => ({ ...r, label: labels.get(r.userId) ?? null }));
  }

  /** The passenger's company, if any (shown as a payment option). */
  async membership(userId: string) {
    if (!(await fetchAutomations()).corporate.enabled) return null;
    const m = await this.prisma.corporateMember.findUnique({ where: { userId }, include: { account: true } });
    if (!m || !m.isActive || !m.account.isActive) return null;
    const w = await this.prisma.wallet.findUnique({ where: { userId: corporateWalletUserId(m.accountId) } });
    return {
      accountId: m.accountId,
      name: m.account.name,
      availableCdf: Math.max(0, (w?.balanceCdf ?? 0) + m.account.creditLimitCdf),
    };
  }

  /** Charges a member's ride to the company (within its credit limit). Idempotent on the ride. */
  async chargeRide(userId: string, rideId: string, amountCdf: number) {
    const m = await this.membership(userId);
    if (!m) throw this.fail('Paiement entreprise indisponible pour ce compte.', HttpStatus.FORBIDDEN);
    const account = await this.prisma.corporateAccount.findUnique({ where: { id: m.accountId } });
    const walletUser = corporateWalletUserId(m.accountId);
    await this.wallet.createWallet(walletUser);
    const reference = `RIDE:${rideId}`;
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; balanceCdf: number }>>`
        SELECT id, "balanceCdf" FROM wallets WHERE "userId" = ${walletUser} FOR UPDATE
      `;
      const w = rows[0];
      if (!w) throw this.fail('Compte entreprise sans portefeuille.');
      const dup = await tx.walletTransaction.findFirst({ where: { walletId: w.id, reference, type: 'DEBIT' } });
      if (dup) return { alreadyCharged: true, accountName: m.name };
      if (!corporateCanPay(w.balanceCdf, amountCdf, account?.creditLimitCdf ?? 0)) {
        throw this.fail(`Plafond de l’entreprise atteint : payez autrement ou contactez votre entreprise.`);
      }
      await tx.wallet.update({ where: { id: w.id }, data: { balanceCdf: { decrement: amountCdf } } });
      await tx.walletTransaction.create({
        data: { walletId: w.id, amountCdf: -amountCdf, type: 'DEBIT', description: `Course ${rideId.slice(0, 8)} (membre)`, reference },
      });
      return { alreadyCharged: false, accountName: m.name };
    });
  }
}
