import { Injectable } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException, formatCdf } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async createWallet(userId: string) {
    return this.prisma.wallet.upsert({ where: { userId }, create: { userId, balanceCdf: 0 }, update: {} });
  }

  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!wallet) {
      await this.createWallet(userId);
      wallet = await this.prisma.wallet.findUnique({
        where: { userId },
        include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } },
      });
    }
    return {
      ...wallet,
      formattedBalance: formatCdf(wallet!.balanceCdf),
      availableBalanceCdf: wallet!.balanceCdf - (wallet!.heldBalanceCdf ?? 0),
      heldBalanceCdf: wallet!.heldBalanceCdf ?? 0,
      currency: 'CDF',
    };
  }

  async getTransactions(userId: string, limit = 20, offset = 0) {
    const wallet = await this.getWallet(userId);
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = Math.max(offset, 0);
    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);
    return { data: transactions, total, limit: take, offset: skip, currency: 'CDF' };
  }

  async credit(userId: string, amountCdf: number, description: string, reference?: string) {
    const wallet = await this.getWallet(userId);
    const updated = await this.prisma.wallet.update({ where: { id: wallet.id }, data: { balanceCdf: { increment: amountCdf } } });
    await this.prisma.walletTransaction.create({
      data: { walletId: wallet.id, amountCdf, type: 'CREDIT', description, reference },
    });
    return updated;
  }

  async debit(userId: string, amountCdf: number, description: string, reference?: string) {
    const wallet = await this.getWallet(userId);
    const available = wallet.balanceCdf - (wallet.heldBalanceCdf ?? 0);
    if (available < amountCdf) throw new MovaHttpException(MovaErrorCode.PAYMENT_INSUFFICIENT_BALANCE);
    const updated = await this.prisma.wallet.update({ where: { id: wallet.id }, data: { balanceCdf: { decrement: amountCdf } } });
    await this.prisma.walletTransaction.create({
      data: { walletId: wallet.id, amountCdf: -amountCdf, type: 'DEBIT', description, reference },
    });
    return updated;
  }

  async holdFunds(
    userId: string,
    amountCdf: number,
    referenceType: string,
    referenceId: string,
    description?: string,
  ) {
    if (amountCdf <= 0) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Montant de séquestre invalide.');
    const wallet = await this.getWallet(userId);
    const available = wallet.balanceCdf - (wallet.heldBalanceCdf ?? 0);
    if (available < amountCdf) throw new MovaHttpException(MovaErrorCode.PAYMENT_INSUFFICIENT_BALANCE);

    const existing = await this.prisma.walletHold.findUnique({
      where: { referenceType_referenceId: { referenceType, referenceId } },
    });
    if (existing?.status === 'ACTIVE') {
      return { holdId: existing.id, amountCdf: existing.amountCdf, status: existing.status };
    }

    const hold = await this.prisma.$transaction(async (tx) => {
      const created = await tx.walletHold.create({
        data: { walletId: wallet.id, amountCdf, referenceType, referenceId, status: 'ACTIVE' },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { heldBalanceCdf: { increment: amountCdf } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amountCdf: 0,
          type: 'HOLD',
          description: description ?? `Séquestre ${referenceType} ${referenceId}`,
          reference: `${referenceType}:${referenceId}`,
        },
      });
      return created;
    });
    return { holdId: hold.id, amountCdf: hold.amountCdf, status: hold.status };
  }

  async releaseHold(referenceType: string, referenceId: string) {
    const hold = await this.prisma.walletHold.findUnique({
      where: { referenceType_referenceId: { referenceType, referenceId } },
    });
    if (!hold || hold.status !== 'ACTIVE') return { released: false };
    await this.prisma.$transaction(async (tx) => {
      await tx.walletHold.update({ where: { id: hold.id }, data: { status: 'RELEASED' } });
      await tx.wallet.update({
        where: { id: hold.walletId },
        data: { heldBalanceCdf: { decrement: hold.amountCdf } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: hold.walletId,
          amountCdf: 0,
          type: 'HOLD_RELEASE',
          description: `Libération séquestre ${referenceType} ${referenceId}`,
          reference: `${referenceType}:${referenceId}`,
        },
      });
    });
    return { released: true, amountCdf: hold.amountCdf };
  }

  async captureHold(referenceType: string, referenceId: string, captureAmountCdf?: number) {
    const hold = await this.prisma.walletHold.findUnique({
      where: { referenceType_referenceId: { referenceType, referenceId } },
    });
    if (!hold || hold.status !== 'ACTIVE') return { captured: false };
    const capture = Math.min(captureAmountCdf ?? hold.amountCdf, hold.amountCdf);
    const releaseRemainder = hold.amountCdf - capture;
    await this.prisma.$transaction(async (tx) => {
      await tx.walletHold.update({ where: { id: hold.id }, data: { status: 'CAPTURED' } });
      await tx.wallet.update({
        where: { id: hold.walletId },
        data: {
          heldBalanceCdf: { decrement: hold.amountCdf },
          balanceCdf: { decrement: capture },
        },
      });
      if (capture > 0) {
        await tx.walletTransaction.create({
          data: {
            walletId: hold.walletId,
            amountCdf: -capture,
            type: 'DEBIT',
            description: `Débit séquestre ${referenceType} ${referenceId}`,
            reference: `${referenceType}:${referenceId}`,
          },
        });
      }
      if (releaseRemainder > 0) {
        await tx.walletTransaction.create({
          data: {
            walletId: hold.walletId,
            amountCdf: 0,
            type: 'HOLD_RELEASE',
            description: `Reliquat séquestre ${referenceType} ${referenceId}`,
            reference: `${referenceType}:${referenceId}`,
          },
        });
      }
    });
    return { captured: true, amountCdf: capture };
  }

  async internalDebit(userId: string, amountCdf: number, description: string, reference?: string) {
    return this.debit(userId, amountCdf, description, reference);
  }

  async topUp(userId: string, amountCdf: number, provider: string) {
    const ref = `topup_${provider}_${Date.now()}`;
    const wallet = await this.credit(userId, amountCdf, `Recharge ${provider}`, ref);
    return {
      success: true,
      message: `Recharge de ${formatCdf(amountCdf)} effectuée`,
      amountCdf,
      provider,
      balanceCdf: wallet.balanceCdf,
      formattedBalance: formatCdf(wallet.balanceCdf),
      providerRef: ref,
    };
  }

  async payFromWallet(userId: string, amountCdf: number, referenceType: string, referenceId: string, description?: string) {
    const ref = `${referenceType}:${referenceId}`;
    const desc = description ?? `Paiement ${referenceType} ${referenceId}`;
    const wallet = await this.debit(userId, amountCdf, desc, ref);
    return {
      success: true,
      message: 'Paiement portefeuille effectué',
      amountCdf,
      referenceType,
      referenceId,
      balanceCdf: wallet.balanceCdf,
      formattedBalance: formatCdf(wallet.balanceCdf),
    };
  }

  async withdrawToMobileMoney(userId: string, amountCdf: number, provider: string, phone: string) {
    const normalizedProvider = provider?.trim().toUpperCase() || 'ORANGE_MONEY';
    const normalizedPhone = phone?.trim();
    if (!normalizedPhone) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Numéro Mobile Money requis.');
    }
    if (amountCdf < 500) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Montant minimum : 500 FC.');
    }

    const reference = `withdraw_${normalizedProvider}_${Date.now()}`;
    const wallet = await this.debit(
      userId,
      amountCdf,
      `Retrait ${normalizedProvider} vers ${normalizedPhone}`,
      reference,
    );

    return {
      success: true,
      message: `Retrait de ${formatCdf(amountCdf)} vers ${normalizedPhone} en cours`,
      amountCdf,
      provider: normalizedProvider,
      phone: normalizedPhone,
      balanceCdf: wallet.balanceCdf,
      formattedBalance: formatCdf(wallet.balanceCdf),
      reference,
    };
  }

  async listTransactionsAdmin(skip = 0, take = 50, userId?: string) {
    const where = userId ? { wallet: { userId } } : {};
    const [data, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { wallet: { select: { userId: true, balanceCdf: true } } },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return { data, total, skip, take, currency: 'CDF' };
  }

  async overview() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [balanceAgg, transactionsToday, walletCount] = await Promise.all([
      this.prisma.wallet.aggregate({ _sum: { balanceCdf: true } }),
      this.prisma.walletTransaction.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.wallet.count(),
    ]);
    return {
      totalBalanceCdf: balanceAgg._sum.balanceCdf ?? 0,
      pendingPayoutsCdf: 0,
      transactionsToday,
      walletCount,
      currency: 'CDF',
    };
  }

  async adminAdjust(userId: string, amountCdf: number, type: 'CREDIT' | 'DEBIT', description: string) {
    if (type === 'CREDIT') {
      const wallet = await this.credit(userId, amountCdf, description, `admin_adjust_${Date.now()}`);
      return { wallet, message: `Crédit manuel de ${formatCdf(amountCdf)} appliqué.` };
    }
    const wallet = await this.debit(userId, amountCdf, description, `admin_adjust_${Date.now()}`);
    return { wallet, message: `Débit manuel de ${formatCdf(amountCdf)} appliqué.` };
  }
}
