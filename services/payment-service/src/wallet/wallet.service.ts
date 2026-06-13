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
    if (wallet.balanceCdf < amountCdf) throw new MovaHttpException(MovaErrorCode.PAYMENT_INSUFFICIENT_BALANCE);
    const updated = await this.prisma.wallet.update({ where: { id: wallet.id }, data: { balanceCdf: { decrement: amountCdf } } });
    await this.prisma.walletTransaction.create({
      data: { walletId: wallet.id, amountCdf: -amountCdf, type: 'DEBIT', description, reference },
    });
    return updated;
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
}
