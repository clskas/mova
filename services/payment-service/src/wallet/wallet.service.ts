import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  MOVA_PLATFORM_USER_ID,
  MovaErrorCode,
  MovaHttpException,
  RedisService,
  afrisoftHubReference,
  afrisoftPayHubGetPayment,
  afrisoftPayHubInitiatePayout,
  formatCdf,
  isAfrisoftHubAsyncRef,
  isAfrisoftPayHubClientConfigured,
  isAfrisoftPayHubMode,
  SERDIPAY_MIN_AMOUNT_CDF,
  type MobileMoneyOperator,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { initiateViaGateway } from '../payments/payment-providers';

const TOPUP_LOCK_PREFIX = 'wallet:topup:';
const TOPUP_LOCK_TTL_SEC = 60;
const STALE_PAYOUT_MIN_AGE_MS = 15 * 60 * 1000;

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private envGetter = (key: string) => this.config.get<string>(key);

  private isMockPayments() {
    return this.config.get('MOCK_PAYMENTS') === 'true';
  }

  /** NODE_ENV=production or a real AfriSoft / Render host — never simulate money. */
  private isProductionLike(): boolean {
    if (this.config.get('NODE_ENV') === 'production') return true;
    const hosts = [
      this.config.get<string>('RENDER_EXTERNAL_URL'),
      this.config.get<string>('RENDER_EXTERNAL_HOSTNAME'),
      this.config.get<string>('AFRISOFT_PAY_HUB_URL'),
      this.config.get<string>('PAY_HUB_URL'),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return /afri-soft\.com|onrender\.com|serdipay\.com/.test(hosts);
  }

  private assertMockAllowed() {
    if (this.isProductionLike() || this.config.get('NODE_ENV') === 'production') {
      throw new MovaHttpException(
        MovaErrorCode.INTERNAL_ERROR,
        undefined,
        'Crédit simulé / MOCK interdit en production. Le portefeuille n’est crédité qu’après confirmation hub/webhook.',
      );
    }
    if (this.isMockPayments()) return;
    throw new MovaHttpException(
      MovaErrorCode.INTERNAL_ERROR,
      undefined,
      'MOCK_PAYMENTS n’est pas activé — recharge simulée refusée.',
    );
  }

  private assertPositiveIntAmount(amountCdf: number, label = 'Montant') {
    if (!Number.isInteger(amountCdf) || amountCdf < 1) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        `${label} invalide : entier ≥ 1 requis.`,
      );
    }
  }

  private async findExistingLedger(reference: string, type: string) {
    if (!reference.trim()) return null;
    return this.prisma.walletTransaction.findFirst({
      where: { reference, type },
      orderBy: { createdAt: 'desc' },
    });
  }

  async ensurePlatformWallet() {
    return this.createWallet(MOVA_PLATFORM_USER_ID);
  }

  async createWallet(userId: string) {
    return this.prisma.wallet.upsert({ where: { userId }, create: { userId, balanceCdf: 0 }, update: {} });
  }

  async purgeUserData(userId: string) {
    await this.prisma.userSubscription.deleteMany({ where: { userId } });
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return { frozen: false, heldCdf: 0, userId };
    const available = wallet.balanceCdf - (wallet.heldBalanceCdf ?? 0);
    if (available > 0) {
      await this.holdFunds(userId, available, 'DELETED_USER', userId, 'Compte supprimé — solde gelé');
    }
    return { frozen: true, heldCdf: Math.max(0, available), userId };
  }

  async getWallet(userId: string) {
    const id = userId?.trim();
    if (!id) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'userId requis');
    }
    try {
      await this.reconcileStalePayouts(id);
    } catch (e) {
      this.logger.warn(`reconcileStalePayouts failed: ${(e as Error).message}`);
    }
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId: id },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!wallet) {
      await this.createWallet(id);
      wallet = await this.prisma.wallet.findUnique({
        where: { userId: id },
        include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } },
      });
    }
    if (!wallet) {
      throw new MovaHttpException(
        MovaErrorCode.INTERNAL_ERROR,
        undefined,
        'Impossible de créer le portefeuille.',
      );
    }
    return {
      ...wallet,
      formattedBalance: formatCdf(wallet.balanceCdf),
      availableBalanceCdf: wallet.balanceCdf - (wallet.heldBalanceCdf ?? 0),
      heldBalanceCdf: wallet.heldBalanceCdf ?? 0,
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
    this.assertPositiveIntAmount(amountCdf, 'Crédit');
    if (reference) {
      const existing = await this.findExistingLedger(reference, 'CREDIT');
      if (existing) {
        return this.prisma.wallet.findUnique({ where: { userId } });
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM wallets WHERE "userId" = ${userId} FOR UPDATE
      `;
      let walletId = locked[0]?.id;
      if (!walletId) {
        const created = await tx.wallet.upsert({
          where: { userId },
          create: { userId, balanceCdf: 0 },
          update: {},
        });
        walletId = created.id;
      }
      if (reference) {
        const dup = await tx.walletTransaction.findFirst({
          where: { reference, type: 'CREDIT' },
        });
        if (dup) {
          return tx.wallet.findUnique({ where: { id: walletId } });
        }
      }
      const updated = await tx.wallet.update({
        where: { id: walletId },
        data: { balanceCdf: { increment: amountCdf } },
      });
      await tx.walletTransaction.create({
        data: { walletId, amountCdf, type: 'CREDIT', description, reference },
      });
      return updated;
    });
  }

  async debit(
    userId: string,
    amountCdf: number,
    description: string,
    reference?: string,
    db?: { $queryRaw: PrismaService['$queryRaw']; wallet: PrismaService['wallet']; walletTransaction: PrismaService['walletTransaction'] },
  ) {
    this.assertPositiveIntAmount(amountCdf, 'Débit');
    const run = async (
      tx: { $queryRaw: PrismaService['$queryRaw']; wallet: PrismaService['wallet']; walletTransaction: PrismaService['walletTransaction'] },
    ) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; balanceCdf: number; heldBalanceCdf: number }>
      >`
        SELECT id, "balanceCdf", "heldBalanceCdf" FROM wallets WHERE "userId" = ${userId} FOR UPDATE
      `;
      let wallet = rows[0];
      if (!wallet) {
        const created = await tx.wallet.upsert({
          where: { userId },
          create: { userId, balanceCdf: 0 },
          update: {},
        });
        wallet = { id: created.id, balanceCdf: created.balanceCdf, heldBalanceCdf: created.heldBalanceCdf ?? 0 };
      }
      if (reference) {
        const dup = await tx.walletTransaction.findFirst({
          where: { reference, type: 'DEBIT' },
        });
        if (dup) {
          return tx.wallet.findUnique({ where: { id: wallet.id } });
        }
      }
      const available = wallet.balanceCdf - (wallet.heldBalanceCdf ?? 0);
      if (available < amountCdf) {
        throw new MovaHttpException(MovaErrorCode.PAYMENT_INSUFFICIENT_BALANCE);
      }
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceCdf: { decrement: amountCdf } },
      });
      await tx.walletTransaction.create({
        data: { walletId: wallet.id, amountCdf: -amountCdf, type: 'DEBIT', description, reference },
      });
      return updated;
    };
    if (db) return run(db);
    if (reference) {
      const existing = await this.findExistingLedger(reference, 'DEBIT');
      if (existing) {
        return this.prisma.wallet.findUnique({ where: { userId } });
      }
    }
    return this.prisma.$transaction(async (tx) => run(tx));
  }

  async creditPlatformFee(amountCdf: number, description: string, reference: string) {
    if (amountCdf <= 0) return null;
    if (reference) {
      const already = await this.findExistingLedger(reference, 'CREDIT');
      if (already) return null;
    }
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
    if (p === 'MPESA' || p === 'M-PESA' || p === 'MP') return 'MPESA';
    if (p === 'AIRTEL_MONEY' || p === 'AIRTEL' || p === 'AM') return 'AIRTEL_MONEY';
    if (p === 'AFRIMONEY' || p === 'AF') return 'AFRIMONEY';
    if (p === 'ORANGE_MONEY' || p === 'ORANGE' || p === 'OM') return 'ORANGE_MONEY';
    throw new MovaHttpException(
      MovaErrorCode.PAYMENT_INVALID_METHOD,
      undefined,
      `Opérateur inconnu: ${provider}. Utilisez ORANGE_MONEY, MPESA, AIRTEL_MONEY ou AFRIMONEY.`,
    );
  }

  async topUp(userId: string, amountCdf: number, provider: string, phone?: string) {
    this.assertPositiveIntAmount(amountCdf, 'Montant de recharge');
    // SerdiPay Public API floor (402 below min) — see SERDIPAY_MIN_AMOUNT_CDF.
    if (amountCdf < SERDIPAY_MIN_AMOUNT_CDF) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        `Montant minimum : ${SERDIPAY_MIN_AMOUNT_CDF.toLocaleString('fr-FR')} FC (contrainte Mobile Money).`,
      );
    }
    await this.acquireTopUpLock(userId, amountCdf);
    const providerKey = (provider ?? '').trim().toUpperCase();
    if (!providerKey) {
      throw new MovaHttpException(
        MovaErrorCode.PAYMENT_INVALID_METHOD,
        undefined,
        'Opérateur Mobile Money requis (ORANGE_MONEY, MPESA, AIRTEL_MONEY ou AFRIMONEY).',
      );
    }
    const ref = afrisoftHubReference('senga', 'topup', randomUUID());

    const walletForLock = await this.createWallet(userId);
    const recentPending = await this.prisma.walletTransaction.findFirst({
      where: {
        walletId: walletForLock.id,
        type: 'TOPUP_PENDING',
        amountCdf,
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recentPending) {
      return {
        success: true,
        simulated: false,
        pendingMobileMoney: true,
        message: 'Recharge déjà en cours — confirmez sur votre téléphone ou patientez 2 minutes.',
        amountCdf,
        provider: providerKey,
        balanceCdf: walletForLock.balanceCdf,
        formattedBalance: formatCdf(walletForLock.balanceCdf),
        providerRef: recentPending.reference ?? ref,
      };
    }

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

  async payFromWallet(_userId: string, _amountCdf: number, _referenceType: string, _referenceId: string, _description?: string) {
    throw new MovaHttpException(
      MovaErrorCode.AUTH_UNAUTHORIZED,
      undefined,
      'POST /wallet/pay est fermé. Utilisez POST /payments/rides/:id ou /payments/services/:type/:id (montant serveur).',
    );
  }

  /**
   * Wallet payment for a service: consume an ACTIVE hold if present (one debit),
   * otherwise debit. Never capture then debit again.
   */
  async consumeHoldOrDebit(
    userId: string,
    amountCdf: number,
    referenceType: string,
    referenceId: string,
    description: string,
  ) {
    this.assertPositiveIntAmount(amountCdf, 'Montant');
    const type = referenceType.toUpperCase();
    const hold = await this.prisma.walletHold.findUnique({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
    });
    if (hold?.status === 'CAPTURED') {
      return { consumed: true, via: 'HOLD' as const, already: true, amountCdf: hold.amountCdf };
    }
    if (hold?.status === 'ACTIVE') {
      const captured = await this.captureHold(type, referenceId, amountCdf);
      if (captured.captured) {
        return { consumed: true, via: 'HOLD' as const, already: false, amountCdf: captured.amountCdf };
      }
    }
    const wallet = await this.debit(userId, amountCdf, description, `${type}:${referenceId}`);
    return {
      consumed: true,
      via: 'DEBIT' as const,
      already: false,
      amountCdf,
      balanceCdf: wallet.balanceCdf,
    };
  }

  async withdrawToMobileMoney(userId: string, amountCdf: number, provider: string, phone: string) {
    this.assertPositiveIntAmount(amountCdf, 'Montant de retrait');
    const normalizedProvider = provider?.trim().toUpperCase() || 'ORANGE_MONEY';
    const normalizedPhone = phone?.trim();
    if (!normalizedPhone) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Numéro Mobile Money requis.');
    }
    if (amountCdf < SERDIPAY_MIN_AMOUNT_CDF) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        `Montant minimum : ${SERDIPAY_MIN_AMOUNT_CDF.toLocaleString('fr-FR')} FC (contrainte Mobile Money).`,
      );
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
    this.assertPositiveIntAmount(amountCdf, 'Ajustement');
    const auditRef = `admin_adjust_${type}_${Date.now()}`;
    if (type === 'CREDIT') {
      const wallet = await this.credit(userId, amountCdf, description, auditRef);
      return { wallet, message: `Crédit manuel de ${formatCdf(amountCdf)} appliqué.` };
    }
    const wallet = await this.debit(userId, amountCdf, description, auditRef);
    return { wallet, message: `Débit manuel de ${formatCdf(amountCdf)} appliqué.` };
  }

  async completePendingTopUp(
    providerRef: string,
    outcome: 'COMPLETED' | 'FAILED',
    message?: string,
    altRefs: string[] = [],
    confirmedAmountCdf?: number,
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
      const failed = await this.prisma.walletTransaction.updateMany({
        where: { id: pending.id, type: 'TOPUP_PENDING' },
        data: {
          type: 'TOPUP_FAILED',
          description: message ?? pending.description ?? 'Recharge Mobile Money échouée',
        },
      });
      if (failed.count !== 1) {
        return { found: true, alreadyFinal: true, status: 'COMPLETED', balanceCdf: pending.wallet.balanceCdf };
      }
      return { found: true, status: 'FAILED', balanceCdf: pending.wallet.balanceCdf };
    }

    if (
      confirmedAmountCdf != null &&
      Number.isFinite(confirmedAmountCdf) &&
      Math.round(confirmedAmountCdf) !== pending.amountCdf
    ) {
      this.logger.error(
        `Top-up amount mismatch ref=${pending.reference} pending=${pending.amountCdf} hub=${confirmedAmountCdf}`,
      );
      const failed = await this.prisma.walletTransaction.updateMany({
        where: { id: pending.id, type: 'TOPUP_PENDING' },
        data: {
          type: 'TOPUP_FAILED',
          description: `Montant hub (${confirmedAmountCdf}) ≠ montant en attente (${pending.amountCdf})`,
        },
      });
      if (failed.count !== 1) {
        return { found: true, alreadyFinal: true, status: 'COMPLETED', balanceCdf: pending.wallet.balanceCdf };
      }
      return { found: true, status: 'FAILED', balanceCdf: pending.wallet.balanceCdf };
    }

    const description =
      pending.description?.replace(/\s+en attente$/i, '') ?? 'Recharge Mobile Money';
    const wallet = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.walletTransaction.updateMany({
        where: { id: pending.id, type: 'TOPUP_PENDING' },
        data: { type: 'TOPUP_COMPLETED', description },
      });
      if (claimed.count !== 1) return null;
      return tx.wallet.update({
        where: { id: pending.walletId },
        data: { balanceCdf: { increment: pending.amountCdf } },
      });
    });
    if (!wallet) {
      const current = await this.prisma.wallet.findUnique({ where: { id: pending.walletId } });
      return {
        found: true,
        alreadyFinal: true,
        status: 'COMPLETED',
        balanceCdf: current?.balanceCdf ?? pending.wallet.balanceCdf,
      };
    }
    return { found: true, status: 'COMPLETED', balanceCdf: wallet.balanceCdf };
  }

  private topUpLockKey(userId: string, amountCdf: number) {
    return `${TOPUP_LOCK_PREFIX}${userId}:${amountCdf}`;
  }

  /** Short Redis lock (60s) so a double-tap cannot open two C2B. Fail-closed if Redis is down. */
  private async acquireTopUpLock(userId: string, amountCdf: number) {
    const client = this.redis?.client;
    if (!client) return;
    try {
      const ok = await client.set(this.topUpLockKey(userId, amountCdf), '1', 'EX', TOPUP_LOCK_TTL_SEC, 'NX');
      if (!ok) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          HttpStatus.TOO_MANY_REQUESTS,
          'Recharge déjà en cours — patientez une minute.',
        );
      }
    } catch (e) {
      if (e instanceof MovaHttpException) throw e;
      throw new MovaHttpException(
        MovaErrorCode.INTERNAL_ERROR,
        HttpStatus.SERVICE_UNAVAILABLE,
        'Recharge temporairement indisponible. Réessayez.',
      );
    }
  }

  /**
   * User-triggered reconcile: refund a debit-then-B2C withdraw only when the hub says FAILED.
   * PENDING-stuck is not auto-refunded (would race a late B2C success).
   */
  private async reconcileStalePayouts(userId: string) {
    if (!isAfrisoftPayHubClientConfigured(this.envGetter) || isAfrisoftPayHubMode(this.envGetter)) {
      return;
    }
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return;
    const cutoff = new Date(Date.now() - STALE_PAYOUT_MIN_AGE_MS);
    const debits = await this.prisma.walletTransaction.findMany({
      where: {
        walletId: wallet.id,
        type: 'DEBIT',
        description: { contains: 'Retrait' },
        createdAt: { lte: cutoff },
      },
      take: 8,
      orderBy: { createdAt: 'desc' },
    });
    for (const debit of debits) {
      if (!debit.reference) continue;
      const already = await this.prisma.walletTransaction.findFirst({
        where: {
          walletId: wallet.id,
          type: 'CREDIT',
          OR: [{ reference: `rollback_${debit.reference}` }, { reference: debit.reference }],
        },
      });
      if (already) continue;
      const remote = await afrisoftPayHubGetPayment(this.envGetter, debit.reference);
      if (remote.status === 'FAILED') {
        await this.refundFailedPayout([debit.reference], remote.message);
      }
    }
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
        await this.completePendingTopUp(
          providerRef,
          remote.status,
          remote.message,
          [remote.paymentId ?? '', remote.providerRef ?? '', remote.reference ?? ''],
          remote.amountCdf,
        );
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
