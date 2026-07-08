import { Injectable, Logger } from '@nestjs/common';
import { CashDebtCategory, CashDebtStatus } from '@prisma/client';
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
}
