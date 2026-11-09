import type { PrismaService } from '../prisma/prisma.service';

export type PassengerRatingSummary = { passengerRating: number | null; passengerRatingCount: number };

const EMPTY: PassengerRatingSummary = { passengerRating: null, passengerRatingCount: 0 };

/**
 * Average score drivers gave each passenger (only ratings received *as passenger* — someone
 * who is also a driver keeps the two notes apart). null = new passenger, never rated.
 */
export async function passengerRatingSummaries(
  prisma: Pick<PrismaService, 'rating'>,
  passengerIds: string[],
): Promise<Map<string, PassengerRatingSummary>> {
  const ids = [...new Set(passengerIds.filter(Boolean))];
  const out = new Map<string, PassengerRatingSummary>();
  if (ids.length === 0) return out;
  const rows = await prisma.rating.findMany({
    where: { toUserId: { in: ids }, ride: { passengerId: { in: ids } } },
    select: { toUserId: true, score: true, ride: { select: { passengerId: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (r.ride?.passengerId !== r.toUserId) continue;
    const a = acc.get(r.toUserId) ?? { sum: 0, n: 0 };
    a.sum += r.score;
    a.n += 1;
    acc.set(r.toUserId, a);
  }
  for (const id of ids) {
    const a = acc.get(id);
    out.set(id, a ? { passengerRating: Math.round((a.sum / a.n) * 10) / 10, passengerRatingCount: a.n } : EMPTY);
  }
  return out;
}

export async function passengerRatingSummary(
  prisma: Pick<PrismaService, 'rating'>,
  passengerId: string,
): Promise<PassengerRatingSummary> {
  return (await passengerRatingSummaries(prisma, [passengerId])).get(passengerId) ?? EMPTY;
}
