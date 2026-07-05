import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MOVA_PLATFORM_USER_ID,
  MovaErrorCode,
  MovaHttpException,
  africasTalkingDisburseMobileMoney,
  africasTalkingInitiateMobileMoney,
  formatCdf,
  useAfricasTalkingMobileMoney,
  type MobileMoneyOperator,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private envGetter = (key: string) => this.config.get<string>(key);

  private isMockPayments() {
    return this.config.get('MOCK_PAYMENTS') === 'true';
  }

  private assertMockAllowed() {
    if (this.config.get('NODE_ENV') === 'production' && this.isMockPayments()) {
      throw new MovaHttpException(
        MovaErrorCode.INTERNAL_ERROR,
        undefined,
        'MOCK_PAYMENTS interdit en production.',
      );
    }
  }

  async ensurePlatformWallet() {
    return this.createWallet(MOVA_PLATFORM_USER_ID);
  }

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

  async creditPlatformFee(amountCdf: number, description: string, reference: string) {
    if (amountCdf <= 0) return null;
    await this.ensurePlatformWallet();
    return this.credit(MOVA_PLATFORM_USER_ID, amountCdf, description, reference);
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

  private mapProvider(provider: string): MobileMoneyOperator {
    const p = provider.trim().toUpperCase();
    if (p === 'MPESA' || p === 'M-PESA') return 'MPESA';
    if (p === 'AIRTEL_MONEY' || p === 'AIRTEL') return 'AIRTEL_MONEY';
    return 'ORANGE_MONEY';
  }

  async topUp(userId: string, amountCdf: number, provider: string, phone?: string) {
    if (amountCdf < 500) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Montant minimum : 500 FC.');
    }
    const ref = `topup_${provider}_${Date.now()}`;
    const providerKey = provider.trim().toUpperCase();

    if (providerKey === 'MOCK') {
      this.assertMockAllowed();
      const wallet = await this.credit(userId, amountCdf, 'Recharge test MOVA (simulation)', ref);
      return {
        success: true,
        simulated: true,
        message: `Recharge test de ${formatCdf(amountCdf)} — crédit instantané (mode simulation).`,
        amountCdf,
        provider: 'MOCK',
        balanceCdf: wallet.balanceCdf,
        formattedBalance: formatCdf(wallet.balanceCdf),
        providerRef: ref,
      };
    }

    const operator = this.mapProvider(provider);
    const useAt = useAfricasTalkingMobileMoney(this.envGetter) && phone?.trim();

    if (useAt) {
      const mm = await africasTalkingInitiateMobileMoney(this.envGetter, {
        operator,
        amountCdf,
        phone: phone!.trim(),
        reference: ref,
      });
      if (!mm.success) {
        throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, undefined, mm.message ?? 'Recharge Mobile Money échouée.');
      }
      const wallet = await this.credit(userId, amountCdf, `Recharge ${provider}`, mm.providerRef ?? ref);
      return {
        success: true,
        simulated: false,
        message: mm.message ?? `Recharge de ${formatCdf(amountCdf)} effectuée`,
        amountCdf,
        provider,
        balanceCdf: wallet.balanceCdf,
        formattedBalance: formatCdf(wallet.balanceCdf),
        providerRef: mm.providerRef,
      };
    }

    this.assertMockAllowed();
    const wallet = await this.credit(userId, amountCdf, `Recharge ${provider} (simulation)`, ref);
    return {
      success: true,
      simulated: true,
      message: `Recharge simulée de ${formatCdf(amountCdf)} — configurez Africa's Talking pour un vrai Mobile Money.`,
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
    const operator = this.mapProvider(normalizedProvider);
    const useAt = useAfricasTalkingMobileMoney(this.envGetter);

    if (useAt) {
      const wallet = await this.debit(
        userId,
        amountCdf,
        `Retrait ${normalizedProvider} vers ${normalizedPhone}`,
        reference,
      );
      const mm = await africasTalkingDisburseMobileMoney(this.envGetter, {
        operator,
        amountCdf,
        phone: normalizedPhone,
        reference,
      });
      if (!mm.success) {
        await this.credit(userId, amountCdf, `Annulation retrait échoué ${reference}`, `rollback_${reference}`);
        throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, undefined, mm.message ?? 'Retrait Mobile Money échoué.');
      }
      return {
        success: true,
        simulated: false,
        message: mm.message ?? `Retrait de ${formatCdf(amountCdf)} vers ${normalizedPhone} initié`,
        amountCdf,
        provider: normalizedProvider,
        phone: normalizedPhone,
        balanceCdf: wallet.balanceCdf,
        formattedBalance: formatCdf(wallet.balanceCdf),
        reference: mm.providerRef ?? reference,
      };
    }

    this.assertMockAllowed();
    const wallet = await this.debit(
      userId,
      amountCdf,
      `Retrait simulé ${normalizedProvider} vers ${normalizedPhone}`,
      reference,
    );
    return {
      success: true,
      simulated: true,
      message: `Retrait simulé de ${formatCdf(amountCdf)} — configurez Africa's Talking pour un vrai virement.`,
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
    const [balanceAgg, platformWallet, transactionsToday, walletCount, withdrawToday] = await Promise.all([
      this.prisma.wallet.aggregate({ _sum: { balanceCdf: true } }),
      this.prisma.wallet.findUnique({ where: { userId: MOVA_PLATFORM_USER_ID } }),
      this.prisma.walletTransaction.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.wallet.count(),
      this.prisma.walletTransaction.aggregate({
        where: {
          createdAt: { gte: startOfDay },
          type: 'DEBIT',
          description: { contains: 'Retrait' },
        },
        _sum: { amountCdf: true },
      }),
    ]);
    const totalBalance = balanceAgg._sum.balanceCdf ?? 0;
    const platformBalanceCdf = platformWallet?.balanceCdf ?? 0;
    return {
      totalBalanceCdf: totalBalance,
      platformBalanceCdf,
      userLiabilitiesCdf: Math.max(0, totalBalance - platformBalanceCdf),
      pendingPayoutsCdf: Math.abs(withdrawToday._sum.amountCdf ?? 0),
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
