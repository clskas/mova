import type { PrismaService } from '../prisma/prisma.service';

/**
 * Sum of the platform's credits whose reference starts with [prefix], minus those reversed by
 * the test cleanup (entry TEST_VOID:<original id>). Without this, voided test rides stayed in
 * « Encaissements guichet » and « Commissions prépayées » forever.
 */
export async function platformCreditsNotVoided(prisma: PrismaService, walletId: string, prefix: string): Promise<number> {
  const voids = await prisma.walletTransaction.findMany({
    where: { walletId, reference: { startsWith: 'TEST_VOID:' } },
    select: { reference: true },
  });
  const voidedIds = voids.map((v) => String(v.reference).slice('TEST_VOID:'.length)).filter(Boolean);
  const agg = await prisma.walletTransaction.aggregate({
    where: {
      walletId,
      type: 'CREDIT',
      reference: { startsWith: prefix },
      ...(voidedIds.length ? { id: { notIn: voidedIds } } : {}),
    },
    _sum: { amountCdf: true },
  });
  return agg._sum.amountCdf ?? 0;
}

/**
 * « Encaissements guichet » and « Commissions prépayées » are parts of the treasury balance.
 * When money left the treasury afterwards (reset of test data, withdrawal), they cannot be
 * larger than what is still there: a treasury at 0 FC shows 0 FC in both cards.
 */
export function treasuryShares(balanceCdf: number, deskCdf: number, prepaidCdf: number) {
  const left = Math.max(0, balanceCdf);
  const desk = Math.max(0, Math.min(deskCdf, left));
  const prepaid = Math.max(0, Math.min(prepaidCdf, left - desk));
  return { deskCashCollectedCdf: desk, prepaidCommissionCdf: prepaid };
}
