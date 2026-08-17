import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  MOVA_PLATFORM_USER_ID,
  MovaErrorCode,
  MovaHttpException,
  afrisoftHubReference,
  afrisoftPayHubGetPayment,
  afrisoftPayHubInitiatePayout,
  formatCdf,
  isAfrisoftHubAsyncRef,
  isAfrisoftPayHubClientConfigured,
  isAfrisoftPayHubMode,
  type MobileMoneyOperator,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { initiateViaGateway } from '../payments/payment-providers';

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

  async searchPartnerTransactions(
    userId: string,
    opts?: {
      descriptionPrefix?: string;
      from?: Date;
      to?: Date;
      q?: string;
      skip?: number;
      take?: number;
    },
  ) {
    const wallet = await this.getWallet(userId);
    const take = Math.min(Math.max(opts?.take ?? 50, 1), 500);
    const skip = Math.max(opts?.skip ?? 0, 0);
    const q = opts?.q?.trim().toLowerCase();
    const where = {
      walletId: wallet.id,
      type: 'CREDIT' as const,
      ...(opts?.descriptionPrefix ? { description: { startsWith: opts.descriptionPrefix } } : {}),
      ...(opts?.from || opts?.to
        ? {
            createdAt: {
              ...(opts.from ? { gte: opts.from } : {}),
              ...(opts.to ? { lte: opts.to } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { description: { contains: q, mode: 'insensitive' as const } },
              { reference: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [transactions, total, aggregate] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.walletTransaction.count({ where }),
      this.prisma.walletTransaction.aggregate({ where, _sum: { amountCdf: true } }),
    ]);
    return {
      balanceCdf: wallet.balanceCdf,
      formattedBalance: formatCdf(wallet.balanceCdf),
      periodTotalCdf: aggregate._sum.amountCdf ?? 0,
      data: transactions.map((tx) => ({
        id: tx.id,
        amountCdf: tx.amountCdf,
        type: tx.type,
        description: tx.description ?? undefined,
        reference: tx.reference ?? undefined,
        createdAt: tx.createdAt.toISOString(),
      })),
      pagination: { skip, take, total },
      currency: 'CDF',
    };
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
    const providerKey = provider.trim().toUpperCase();
    const ref = afrisoftHubReference('senga', 'topup', randomUUID());

    if (providerKey === 'MOCK') {
      this.assertMockAllowed();
      const wallet = await this.credit(userId, amountCdf, 'Recharge test SENGA (simulation)', ref);
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
    const phoneTrimmed = phone?.trim();
    if (!phoneTrimmed) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Numéro Mobile Money requis.');
    }

    const mm = await initiateViaGateway(this.config, operator, amountCdf, phoneTrimmed, ref, 'topup');
    if (!mm) {
      this.assertMockAllowed();
      const wallet = await this.credit(userId, amountCdf, `Recharge ${provider} (simulation)`, ref);
      return {
        success: true,
        simulated: true,
        message: `Recharge simulée de ${formatCdf(amountCdf)} — configurez le hub AfriSoft (AFRISOFT_PAY_HUB_URL).`,
        amountCdf,
        provider,
        balanceCdf: wallet.balanceCdf,
        formattedBalance: formatCdf(wallet.balanceCdf),
        providerRef: ref,
      };
    }
    if (!mm.success) {
      throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, undefined, mm.message ?? 'Recharge Mobile Money échouée.');
    }

    const providerRef = mm.providerRef ?? ref;
    const paymentUrl = mm.paymentUrl;
    const isAsync = isAfrisoftHubAsyncRef(providerRef) || Boolean(mm.pending);
    if (isAsync) {
      const wallet = await this.createWallet(userId);
      await this.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amountCdf,
          type: 'TOPUP_PENDING',
          description: `Recharge ${provider} en attente`,
          reference: providerRef,
        },
      });
      return {
        success: true,
        simulated: false,
        pendingMobileMoney: true,
        message: mm.message ?? `Confirmez la recharge de ${formatCdf(amountCdf)} sur votre téléphone.`,
        amountCdf,
        provider,
        balanceCdf: wallet.balanceCdf,
        formattedBalance: formatCdf(wallet.balanceCdf),
        providerRef,
        ...(paymentUrl ? { paymentUrl } : {}),
      };
    }

    const wallet = await this.credit(userId, amountCdf, `Recharge ${provider}`, providerRef);
    return {
      success: true,
      simulated: false,
      message: mm.message ?? `Recharge de ${formatCdf(amountCdf)} effectuée`,
      amountCdf,
      provider,
      balanceCdf: wallet.balanceCdf,
      formattedBalance: formatCdf(wallet.balanceCdf),
      providerRef,
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

    const reference = afrisoftHubReference('senga', 'withdraw', randomUUID());
    const operator = this.mapProvider(normalizedProvider);
    const hubClient = isAfrisoftPayHubClientConfigured(this.envGetter) && !isAfrisoftPayHubMode(this.envGetter);

    if (hubClient) {
      const wallet = await this.debit(
        userId,
        amountCdf,
        `Retrait ${normalizedProvider} vers ${normalizedPhone}`,
        reference,
      );
      const mm = await afrisoftPayHubInitiatePayout(this.envGetter, {
        operator,
        amountCdf,
        phone: normalizedPhone,
        reference,
        purpose: 'withdraw',
        idempotencyKey: `senga:withdraw:${reference}`,
      });
      if (!mm.success) {
        await this.credit(userId, amountCdf, `Annulation retrait échoué ${reference}`, `rollback_${reference}`);
        throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, undefined, mm.message ?? 'Retrait Mobile Money échoué.');
      }
      const providerRef = mm.providerRef ?? reference;
      if (providerRef !== reference) {
        await this.prisma.walletTransaction.updateMany({
          where: { reference, type: 'DEBIT' },
          data: { reference: providerRef },
        });
      }
      return {
        success: true,
        simulated: false,
        pendingMobileMoney: Boolean(mm.pending),
        message: mm.message ?? `Retrait de ${formatCdf(amountCdf)} vers ${normalizedPhone} initié`,
        amountCdf,
        provider: normalizedProvider,
        phone: normalizedPhone,
        balanceCdf: wallet.balanceCdf,
        formattedBalance: formatCdf(wallet.balanceCdf),
        reference: mm.providerRef ?? reference,
        providerRef: mm.providerRef ?? reference,
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
      message: `Retrait simulé de ${formatCdf(amountCdf)} — configurez AFRISOFT_PAY_HUB_URL pour un vrai virement.`,
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

  async completePendingTopUp(
    providerRef: string,
    outcome: 'COMPLETED' | 'FAILED',
    message?: string,
    altRefs: string[] = [],
  ): Promise<{ found: boolean; status?: string; balanceCdf?: number; alreadyFinal?: boolean }> {
    const refs = [...new Set([providerRef, ...altRefs].map((r) => r?.trim()).filter(Boolean) as string[])];
    const pending = await this.prisma.walletTransaction.findFirst({
      where: { reference: { in: refs }, type: 'TOPUP_PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { wallet: true },
    });
    if (!pending) {
      const done = await this.prisma.walletTransaction.findFirst({
        where: {
          reference: { in: refs },
          type: { in: ['TOPUP_COMPLETED', 'TOPUP_FAILED', 'CREDIT'] },
        },
        orderBy: { createdAt: 'desc' },
        include: { wallet: true },
      });
      if (done) {
        return {
          found: true,
          alreadyFinal: true,
          status: done.type === 'TOPUP_FAILED' ? 'FAILED' : 'COMPLETED',
          balanceCdf: done.wallet.balanceCdf,
        };
      }
      return { found: false };
    }

    if (outcome === 'FAILED') {
      await this.prisma.walletTransaction.update({
        where: { id: pending.id },
        data: {
          type: 'TOPUP_FAILED',
          description: message ?? pending.description ?? 'Recharge Mobile Money échouée',
        },
      });
      return { found: true, status: 'FAILED', balanceCdf: pending.wallet.balanceCdf };
    }

    const description =
      pending.description?.replace(/\s+en attente$/i, '') ?? 'Recharge Mobile Money';
    const [, wallet] = await this.prisma.$transaction([
      this.prisma.walletTransaction.update({
        where: { id: pending.id },
        data: { type: 'TOPUP_COMPLETED', description },
      }),
      this.prisma.wallet.update({
        where: { id: pending.walletId },
        data: { balanceCdf: { increment: pending.amountCdf } },
      }),
    ]);
    return { found: true, status: 'COMPLETED', balanceCdf: wallet.balanceCdf };
  }

  async refundFailedPayout(
    refs: string[],
    message?: string,
  ): Promise<{ found: boolean; refunded?: boolean }> {
    const debit = await this.prisma.walletTransaction.findFirst({
      where: {
        reference: { in: refs },
        type: 'DEBIT',
        description: { contains: 'Retrait' },
      },
      orderBy: { createdAt: 'desc' },
      include: { wallet: true },
    });
    if (!debit) return { found: false };
    const rollbackRef = `rollback_${debit.reference}`;
    const already = await this.prisma.walletTransaction.findFirst({
      where: {
        walletId: debit.walletId,
        OR: [{ reference: rollbackRef }, { reference: { in: refs.map((r) => `rollback_${r}`) } }],
        type: 'CREDIT',
      },
    });
    if (already) return { found: true, refunded: false };
    await this.credit(
      debit.wallet.userId,
      Math.abs(debit.amountCdf),
      message ?? `Annulation retrait échoué ${debit.reference}`,
      rollbackRef,
    );
    return { found: true, refunded: true };
  }

  async getTopUpStatus(userId: string, providerRef: string) {
    if (!providerRef.trim()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'providerRef requis');
    }
    if (isAfrisoftPayHubClientConfigured(this.envGetter) && !isAfrisoftPayHubMode(this.envGetter)) {
      const remote = await afrisoftPayHubGetPayment(this.envGetter, providerRef);
      if (remote.status === 'COMPLETED' || remote.status === 'FAILED') {
        await this.completePendingTopUp(providerRef, remote.status, remote.message, [
          remote.paymentId ?? '',
          remote.providerRef ?? '',
          remote.reference ?? '',
        ]);
      }
    }
    const wallet = await this.createWallet(userId);
    const tx = await this.prisma.walletTransaction.findFirst({
      where: { walletId: wallet.id, reference: providerRef },
      orderBy: { createdAt: 'desc' },
    });
    if (!tx) {
      return {
        providerRef,
        status: null,
        pendingMobileMoney: false,
        isPaid: false,
        balanceCdf: wallet.balanceCdf,
      };
    }
    const pending = tx.type === 'TOPUP_PENDING';
    const failed = tx.type === 'TOPUP_FAILED';
    const completed = tx.type === 'TOPUP_COMPLETED' || tx.type === 'CREDIT';
    return {
      providerRef,
      status: pending ? 'PENDING' : failed ? 'FAILED' : completed ? 'COMPLETED' : tx.type,
      pendingMobileMoney: pending,
      isPaid: completed,
      amountCdf: tx.amountCdf,
      balanceCdf: wallet.balanceCdf,
      formattedBalance: formatCdf(wallet.balanceCdf),
    };
  }
}
