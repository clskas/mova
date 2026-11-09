import { passengerRatingSummaries } from './passenger-rating.util';

describe('passengerRatingSummaries', () => {
  it('averages only the ratings received as passenger', async () => {
    const prisma = {
      rating: {
        findMany: jest.fn().mockResolvedValue([
          { toUserId: 'p1', score: 5, ride: { passengerId: 'p1' } },
          { toUserId: 'p1', score: 4, ride: { passengerId: 'p1' } },
          // p1 rated as the driver of someone else's ride: not a passenger note
          { toUserId: 'p1', score: 1, ride: { passengerId: 'p2' } },
        ]),
      },
    };
    const out = await passengerRatingSummaries(prisma as never, ['p1', 'p2']);
    expect(out.get('p1')).toEqual({ passengerRating: 4.5, passengerRatingCount: 2 });
    expect(out.get('p2')).toEqual({ passengerRating: null, passengerRatingCount: 0 });
  });

  it('no query without passengers', async () => {
    const prisma = { rating: { findMany: jest.fn() } };
    expect((await passengerRatingSummaries(prisma as never, [])).size).toBe(0);
    expect(prisma.rating.findMany).not.toHaveBeenCalled();
  });
});
