import { Injectable, Logger } from '@nestjs/common';
import { CashDebtCashRequestStatus, CashDebtCategory, CashDebtStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

export type RecordDebtInput = {
  driverUserId: string;
  referenceType: string;
  referenceId: string;
  category: CashDebtCategory;
  amountCdf: number;
  description?: string;
  beneficiaryUserId?: string;
};

@Injectable()
export class DriverDebtLedgerService {
  private readonly logger = new Logger(DriverDebtLedgerService.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
  ) {}

  private debtReference(
    category: CashDebtCategory,
    referenceType: string,
    referenceId: string,
    beneficiaryUserId?: string,
  ) {
    const suffix = beneficiaryUserId ? `:${beneficiaryUserId}` : '';
    return `CASH_DEBT:${category}:${referenceType.toUpperCase()}:${referenceId}${suffix}`;
  }

  async recordDebt(input: RecordDebtInput) {
    const amount = Math.round(input.amountCdf);
    if (amount <= 0) return { recorded: false as const, reason: 'zero_amount' as const };

    const reference = this.debtReference(
      input.category,
      input.referenceType,
      input.referenceId,
      input.beneficiaryUserId,
    );
    const existing = await this.prisma.driverCashDebt.findUnique({ where: { reference } });
    if (existing) return { recorded: false as const, reason: 'already_recorded' as const, debt: existing };

    const debt = await this.prisma.driverCashDebt.create({
      data: {
        driverUserId: input.driverUserId,
        referenceType: input.referenceType.toUpperCase(),
        referenceId: input.referenceId,
        category: input.category,
        amountCdf: amount,
        description: input.description,
        beneficiaryUserId: input.beneficiaryUserId,
        reference,
      },
    });
    this.logger.log(
      `Cash debt recorded for driver ${input.driverUserId}: ${amount} CDF (${input.category} ${input.referenceType}/${input.referenceId})`,
    );
    return { recorded: true as const, debt };
  }

  async getSummary(driverUserId: string) {
    const debts = await this.prisma.driverCashDebt.findMany({
      where: { driverUserId, status: CashDebtStatus.OPEN },
      orderBy: { createdAt: 'desc' },
    });
    const totalOpenCdf = debts.reduce((sum, row) => sum + row.amountCdf, 0);
    const platformFeeCdf = debts
      .filter((row) => row.category === CashDebtCategory.PLATFORM_FEE)
      .reduce((sum, row) => sum + row.amountCdf, 0);
    const restaurantShareCdf = debts
      .filter((row) => row.category === CashDebtCategory.RESTAURANT_SHARE)
      .reduce((sum, row) => sum + row.amountCdf, 0);
    const partnerShareCdf = debts
      .filter((row) => row.category === CashDebtCategory.PARTNER_SHARE)
      .reduce((sum, row) => sum + row.amountCdf, 0);

    return {
      driverUserId,
      totalOpenCdf,
      openCount: debts.length,
      byCategory: { platformFeeCdf, restaurantShareCdf, partnerShareCdf },
      debts: debts.map((row) => ({
        id: row.id,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        category: row.category,
        amountCdf: row.amountCdf,
        description: row.description,
        beneficiaryUserId: row.beneficiaryUserId,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async settleFromWallet(driverUserId: string) {
    const summary = await this.getSummary(driverUserId);
    if (summary.totalOpenCdf <= 0) {
      return { settled: false as const, message: 'Aucune dette espèces ouverte' };
    }

    const settlementRef = `CASH_DEBT_SETTLE:${driverUserId}:${Date.now()}`;
    await this.wallet.debit(
      driverUserId,
      summary.totalOpenCdf,
      'Règlement dettes espèces MOVA',
      settlementRef,
    );

    const updated = await this.prisma.driverCashDebt.updateMany({
      where: { driverUserId, status: CashDebtStatus.OPEN },
      data: {
        status: CashDebtStatus.SETTLED,
        settledAt: new Date(),
        settlementRef,
      },
    });

    return {
      settled: true as const,
      amountCdf: summary.totalOpenCdf,
      settledCount: updated.count,
      settlementRef,
      message: 'Dettes espèces réglées depuis le portefeuille',
    };
  }

  async adminSettleDebt(debtId: string, settlementRef?: string) {
    const debt = await this.prisma.driverCashDebt.findUnique({ where: { id: debtId } });
    if (!debt) return { settled: false as const, message: 'Dette introuvable' };
    if (debt.status === CashDebtStatus.SETTLED) {
      return { settled: false as const, message: 'Dette déjà réglée', debt };
    }
    const ref = settlementRef ?? `CASH_DEBT_ADMIN_SETTLE:${debtId}:${Date.now()}`;
    const updated = await this.prisma.driverCashDebt.update({
      where: { id: debtId },
      data: { status: CashDebtStatus.SETTLED, settledAt: new Date(), settlementRef: ref },
    });
    return { settled: true as const, debt: updated };
  }

  async getAdminOverview(driverUserId?: string) {
    const where = {
      status: CashDebtStatus.OPEN,
      ...(driverUserId ? { driverUserId } : {}),
    };
    const debts = await this.prisma.driverCashDebt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const byDriver = new Map<
      string,
      {
        totalCdf: number;
        platformFeeCdf: number;
        restaurantShareCdf: number;
        partnerShareCdf: number;
        openCount: number;
      }
    >();

    let platformFeeCdf = 0;
    let restaurantShareCdf = 0;
    let partnerShareCdf = 0;

    for (const row of debts) {
      platformFeeCdf += row.category === CashDebtCategory.PLATFORM_FEE ? row.amountCdf : 0;
      restaurantShareCdf += row.category === CashDebtCategory.RESTAURANT_SHARE ? row.amountCdf : 0;
      partnerShareCdf += row.category === CashDebtCategory.PARTNER_SHARE ? row.amountCdf : 0;

      const current = byDriver.get(row.driverUserId) ?? {
        totalCdf: 0,
        platformFeeCdf: 0,
        restaurantShareCdf: 0,
        partnerShareCdf: 0,
        openCount: 0,
      };
      current.totalCdf += row.amountCdf;
      current.openCount += 1;
      if (row.category === CashDebtCategory.PLATFORM_FEE) current.platformFeeCdf += row.amountCdf;
      if (row.category === CashDebtCategory.RESTAURANT_SHARE) current.restaurantShareCdf += row.amountCdf;
      if (row.category === CashDebtCategory.PARTNER_SHARE) current.partnerShareCdf += row.amountCdf;
      byDriver.set(row.driverUserId, current);
    }

    const debtors = [...byDriver.entries()]
      .map(([id, stats]) => ({ driverUserId: id, ...stats }))
      .sort((a, b) => b.totalCdf - a.totalCdf);

    return {
      totalOpenCdf: debts.reduce((sum, row) => sum + row.amountCdf, 0),
      openDebtCount: debts.length,
      debtorCount: debtors.length,
      platformFeeCdf,
      restaurantShareCdf,
      partnerShareCdf,
      debtors,
      debts: debts.map((row) => ({
        id: row.id,
        driverUserId: row.driverUserId,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        category: row.category,
        amountCdf: row.amountCdf,
        description: row.description,
        beneficiaryUserId: row.beneficiaryUserId,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async getPolicy() {
    let policy = await this.prisma.driverDebtPolicy.findUnique({ where: { id: 'default' } });
    if (!policy) {
      policy = await this.prisma.driverDebtPolicy.create({
        data: { id: 'default', maxOpenDebtCdf: 50_000, blockOffers: true, isActive: true },
      });
    }
    return policy;
  }

  async updatePolicy(data: { maxOpenDebtCdf?: number; blockOffers?: boolean; isActive?: boolean }) {
    await this.getPolicy();
    return this.prisma.driverDebtPolicy.update({
      where: { id: 'default' },
      data: {
        ...(data.maxOpenDebtCdf != null ? { maxOpenDebtCdf: Math.max(0, Math.round(data.maxOpenDebtCdf)) } : {}),
        ...(data.blockOffers != null ? { blockOffers: data.blockOffers } : {}),
        ...(data.isActive != null ? { isActive: data.isActive } : {}),
      },
    });
  }

  async getDebtStatus(driverUserId: string) {
    const [summary, policy] = await Promise.all([this.getSummary(driverUserId), this.getPolicy()]);
    const debtBlocked =
      policy.isActive &&
      policy.blockOffers &&
      policy.maxOpenDebtCdf > 0 &&
      summary.totalOpenCdf > policy.maxOpenDebtCdf;
    return {
      debtBlocked,
      openDebtCdf: summary.totalOpenCdf,
      debtThresholdCdf: policy.maxOpenDebtCdf,
      policyActive: policy.isActive,
      blockOffers: policy.blockOffers,
    };
  }

  async filterDriversNotDebtBlocked(driverUserIds: string[]): Promise<string[]> {
    if (driverUserIds.length === 0) return [];
    const policy = await this.getPolicy();
    if (!policy.isActive || !policy.blockOffers || policy.maxOpenDebtCdf <= 0) {
      return driverUserIds;
    }
    const allowed: string[] = [];
    for (const id of driverUserIds) {
      const summary = await this.getSummary(id);
      if (summary.totalOpenCdf <= policy.maxOpenDebtCdf) allowed.push(id);
    }
    return allowed;
  }

  private cashRequestTtlMs() {
    return 2 * 60 * 60 * 1000;
  }

  private buildCashQrPayload(request: { id: string; code: string; amountCdf: number; driverUserId: string }) {
    return JSON.stringify({
      type: 'MOVA_CASH_DEBT',
      requestId: request.id,
      code: request.code,
      amountCdf: request.amountCdf,
      driverUserId: request.driverUserId,
    });
  }

  private async expireStaleCashRequests() {
    await this.prisma.driverCashDebtCashRequest.updateMany({
      where: { status: CashDebtCashRequestStatus.PENDING, expiresAt: { lte: new Date() } },
      data: { status: CashDebtCashRequestStatus.EXPIRED },
    });
  }

  private async uniqueCashCode(): Promise<string> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const code = crypto.randomInt(100000, 999999).toString();
      const existing = await this.prisma.driverCashDebtCashRequest.findUnique({ where: { code } });
      if (!existing) return code;
    }
    throw new Error('Impossible de générer un code de paiement unique');
  }

  async createCashPaymentRequest(driverUserId: string) {
    await this.expireStaleCashRequests();
    const summary = await this.getSummary(driverUserId);
    if (summary.totalOpenCdf <= 0) {
      return { created: false as const, message: 'Aucune dette espèces ouverte' };
    }

    await this.prisma.driverCashDebtCashRequest.updateMany({
      where: { driverUserId, status: CashDebtCashRequestStatus.PENDING },
      data: { status: CashDebtCashRequestStatus.CANCELLED },
    });

    const expiresAt = new Date(Date.now() + this.cashRequestTtlMs());
    const code = await this.uniqueCashCode();
    const request = await this.prisma.driverCashDebtCashRequest.create({
      data: {
        driverUserId,
        amountCdf: summary.totalOpenCdf,
        code,
        expiresAt,
      },
    });

    this.logger.log(`Cash debt payment request ${request.id} for driver ${driverUserId} (${summary.totalOpenCdf} CDF)`);

    return {
      created: true as const,
      requestId: request.id,
      code: request.code,
      amountCdf: summary.totalOpenCdf,
      openCount: summary.openCount,
      expiresAt: expiresAt.toISOString(),
      qrPayload: this.buildCashQrPayload(request),
    };
  }

  async getActiveCashPaymentRequest(driverUserId: string) {
    await this.expireStaleCashRequests();
    const pending = await this.prisma.driverCashDebtCashRequest.findFirst({
      where: {
        driverUserId,
        status: CashDebtCashRequestStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) return null;
    return {
      requestId: pending.id,
      code: pending.code,
      amountCdf: pending.amountCdf,
      expiresAt: pending.expiresAt.toISOString(),
      qrPayload: this.buildCashQrPayload(pending),
    };
  }

  async getCashPaymentRequestStatus(driverUserId: string, requestId: string) {
    await this.expireStaleCashRequests();
    const request = await this.prisma.driverCashDebtCashRequest.findFirst({
      where: { id: requestId, driverUserId },
    });
    if (!request) return { found: false as const };
    return {
      found: true as const,
      status: request.status,
      confirmedAt: request.confirmedAt?.toISOString() ?? null,
      amountCdf: request.amountCdf,
    };
  }

  async confirmCashPaymentRequest(code: string, confirmedByUserId?: string) {
    await this.expireStaleCashRequests();
    const normalized = code.replace(/\s/g, '').trim();
    if (!/^\d{6}$/.test(normalized)) {
      return { confirmed: false as const, message: 'Code à 6 chiffres requis' };
    }

    const request = await this.prisma.driverCashDebtCashRequest.findFirst({
      where: {
        code: normalized,
        status: CashDebtCashRequestStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });
    if (!request) {
      return { confirmed: false as const, message: 'Code invalide ou expiré' };
    }

    const summary = await this.getSummary(request.driverUserId);
    if (summary.totalOpenCdf <= 0) {
      await this.prisma.driverCashDebtCashRequest.update({
        where: { id: request.id },
        data: { status: CashDebtCashRequestStatus.CANCELLED },
      });
      return { confirmed: false as const, message: 'Aucune dette ouverte pour ce chauffeur' };
    }

    const settlementRef = `CASH_DEBT_CASH:${request.id}:${Date.now()}`;
    const updated = await this.prisma.driverCashDebt.updateMany({
      where: { driverUserId: request.driverUserId, status: CashDebtStatus.OPEN },
      data: { status: CashDebtStatus.SETTLED, settledAt: new Date(), settlementRef },
    });

    await this.prisma.driverCashDebtCashRequest.update({
      where: { id: request.id },
      data: {
        status: CashDebtCashRequestStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedBy: confirmedByUserId ?? null,
        settlementRef,
        amountCdf: summary.totalOpenCdf,
      },
    });

    this.logger.log(
      `Cash debt payment confirmed for driver ${request.driverUserId}: ${summary.totalOpenCdf} CDF (${updated.count} ligne(s))`,
    );

    return {
      confirmed: true as const,
      driverUserId: request.driverUserId,
      amountCdf: summary.totalOpenCdf,
      settledCount: updated.count,
      settlementRef,
      message: 'Paiement espèces confirmé — dettes soldées',
    };
  }
}
