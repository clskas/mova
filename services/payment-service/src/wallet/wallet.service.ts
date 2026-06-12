import { Injectable } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}
  async createWallet(userId: string) {
    return this.prisma.wallet.upsert({ where: { userId }, create: { userId, balanceCdf: 0 }, update: {} });
  }
  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!wallet) {
      await this.createWallet(userId);
      wallet = await this.prisma.wallet.findUnique({ where: { userId }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    }
    return wallet;
  }
  async credit(userId: string, amountCdf: number, description: string) {
    const wallet = await this.getWallet(userId);
    const updated = await this.prisma.wallet.update({ where: { id: wallet.id }, data: { balanceCdf: { increment: amountCdf } } });
    await this.prisma.walletTransaction.create({ data: { walletId: wallet.id, amountCdf, type: 'CREDIT', description } });
    return updated;
  }
  async debit(userId: string, amountCdf: number, description: string) {
    const wallet = await this.getWallet(userId);
    if (wallet.balanceCdf < amountCdf) throw new MovaHttpException(MovaErrorCode.PAYMENT_INSUFFICIENT_BALANCE);
    const updated = await this.prisma.wallet.update({ where: { id: wallet.id }, data: { balanceCdf: { decrement: amountCdf } } });
    await this.prisma.walletTransaction.create({ data: { walletId: wallet.id, amountCdf: -amountCdf, type: 'DEBIT', description } });
    return updated;
  }
}
