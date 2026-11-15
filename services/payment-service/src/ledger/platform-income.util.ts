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
