import { Injectable, Logger } from '@nestjs/common';
import { MOVA_PLATFORM_USER_ID } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

export type TestVoidItem = { referenceType: string; referenceId: string; extraIds?: string[] };

type LedgerLine = {
  txId: string;
  userId: string;
  type: 'CREDIT' | 'DEBIT';
  amountCdf: number;
  reference: string | null;
  description: string | null;
  isPlatform: boolean;
  alreadyVoided: boolean;
};

/**
 * Accounting void of test rides / services: every wallet entry that carries the item's id is
 * reversed by an opposite entry (reference TEST_VOID:<original entry id>, so a second run does
 * nothing), open cash debts are closed, active holds released, payments marked refunded.
 * Nothing is deleted. preview() changes nothing.
 */
@Injectable()
export class TestVoidService {
  private readonly logger = new Logger(TestVoidService.name);

  constructor(private prisma: PrismaService, private wallet: WalletService) {}

  private async linesFor(ids: string[]): Promise<LedgerLine[]> {
    const lines: LedgerLine[] = [];
    for (const id of ids) {
      if (!id || id.length < 8) continue;
      const txs = await this.prisma.walletTransaction.findMany({
        where: {
          reference: { contains: id },
          NOT: { reference: { startsWith: 'TEST_VOID:' } },
          type: { in: ['CREDIT', 'DEBIT'] },
        },
        include: { wallet: { select: { userId: true } } },
        orderBy: { createdAt: 'asc' },
      });
      for (const t of txs) {
        const voided = await this.prisma.walletTransaction.findFirst({
          where: { reference: `TEST_VOID:${t.id}` },
          select: { id: true },
        });
        lines.push({
          txId: t.id,
          userId: t.wallet.userId,
          type: t.type as 'CREDIT' | 'DEBIT',
          amountCdf: Math.abs(t.amountCdf),
          reference: t.reference,
          description: t.description,
          isPlatform: t.wallet.userId === MOVA_PLATFORM_USER_ID,
          alreadyVoided: Boolean(voided),
        });
      }
    }
    // Same entry found through two ids: keep it once.
    return [...new Map(lines.map((l) => [l.txId, l])).values()];
  }

  private allIds(item: TestVoidItem): string[] {
    return [...new Set([item.referenceId, ...(item.extraIds ?? [])].filter(Boolean))];
  }

  async preview(items: TestVoidItem[]) {
    const out = [];
    let platformCommissionCdf = 0;
    for (const item of items) {
      const ids = this.allIds(item);
      const lines = await this.linesFor(ids);
      const openDebts = await this.prisma.driverCashDebt.findMany({
        where: { referenceId: { in: ids }, status: 'OPEN' },
        select: { id: true, amountCdf: true, category: true, driverUserId: true },
      });
      const commission = lines
        .filter((l) => l.isPlatform && !l.alreadyVoided)
        .reduce((s, l) => s + (l.type === 'CREDIT' ? l.amountCdf : -l.amountCdf), 0);
      platformCommissionCdf += commission;
      out.push({ ...item, lines, openDebts, platformCommissionCdf: commission });
    }
    return { items: out, platformCommissionCdf };
  }

  async apply(items: TestVoidItem[]) {
    const results = [];
    for (const item of items) {
      const ids = this.allIds(item);
      const lines = await this.linesFor(ids);
      const reversed: string[] = [];
      const failed: { txId: string; userId: string; amountCdf: number; reason: string }[] = [];
      for (const l of lines) {
        if (l.alreadyVoided || l.amountCdf <= 0) continue;
        const ref = `TEST_VOID:${l.txId}`;
        const label = `Annulation test — ${item.referenceType} ${item.referenceId.slice(0, 8)}`;
        try {
          if (l.type === 'CREDIT') await this.wallet.debit(l.userId, l.amountCdf, label, ref);
          else await this.wallet.credit(l.userId, l.amountCdf, label, ref);
          reversed.push(l.txId);
        } catch (e) {
          // Typically a driver who already withdrew the money: left for manual follow-up.
          failed.push({
            txId: l.txId,
            userId: l.userId,
            amountCdf: l.amountCdf,
            reason: e instanceof Error ? e.message : String(e),
          });
        }
      }
      const debts = await this.prisma.driverCashDebt.updateMany({
        where: { referenceId: { in: ids }, status: 'OPEN' },
        data: { status: 'SETTLED', settledAt: new Date(), settlementRef: 'TEST_VOID' },
      });
      for (const id of ids) {
        await this.wallet.releaseHold(item.referenceType, id).catch(() => undefined);
      }
      await this.prisma.payment.updateMany({
        where: { rideId: { in: ids }, status: { in: ['COMPLETED', 'PENDING'] } },
        data: { status: 'REFUNDED' },
      });
      await this.prisma.servicePayment.updateMany({
        where: { referenceId: { in: ids }, status: { in: ['COMPLETED', 'PENDING'] } },
        data: { status: 'REFUNDED' },
      });
      if (failed.length) this.logger.warn(`test void ${item.referenceType}/${item.referenceId}: ${failed.length} entrée(s) à régulariser`);
      results.push({ ...item, reversed: reversed.length, closedDebts: debts.count, failed });
    }
    return { items: results };
  }
}
