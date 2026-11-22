import { __clearSharedOffersCache, SHARED_OFFERS_TTL_MS, sharedOffersQuery } from './shared-offers-cache';

describe('shared offers cache', () => {
  beforeEach(() => __clearSharedOffersCache());

  it('drivers polling together share one query', async () => {
    const load = jest.fn().mockResolvedValue([1]);
    await Promise.all([sharedOffersQuery('rides', load), sharedOffersQuery('rides', load), sharedOffersQuery('rides', load)]);
    expect(load).toHaveBeenCalledTimes(1);
    await sharedOffersQuery('deliveries', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reads again once the TTL is over', async () => {
    const load = jest.fn().mockResolvedValue([1]);
    await sharedOffersQuery('rides', load, SHARED_OFFERS_TTL_MS, 1_000);
    await sharedOffersQuery('rides', load, SHARED_OFFERS_TTL_MS, 1_000 + SHARED_OFFERS_TTL_MS - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await sharedOffersQuery('rides', load, SHARED_OFFERS_TTL_MS, 1_000 + SHARED_OFFERS_TTL_MS);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failure', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('pool')).mockResolvedValue([2]);
    await expect(sharedOffersQuery('rides', load)).rejects.toThrow('pool');
    await expect(sharedOffersQuery('rides', load)).resolves.toEqual([2]);
  });
});
