import { __clearPendingCashLookupCache, PENDING_CASH_LOOKUP_TTL_MS, pendingCashLookup } from './pending-cash-lookup-cache';

describe('pending cash lookup cache', () => {
  beforeEach(() => __clearPendingCashLookupCache());

  it('drivers polling together share one lookup per ride', async () => {
    const load = jest.fn().mockResolvedValue({ driverId: 'd1' });
    await Promise.all([pendingCashLookup('ride:r1', load), pendingCashLookup('ride:r1', load), pendingCashLookup('ride:r1', load)]);
    expect(load).toHaveBeenCalledTimes(1);
    await pendingCashLookup('ride:r2', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('asks again once the TTL is over', async () => {
    const load = jest.fn().mockResolvedValue({ driverId: 'd1' });
    const t = 1_000_000;
    await pendingCashLookup('ride:r1', load, t);
    await pendingCashLookup('ride:r1', load, t + PENDING_CASH_LOOKUP_TTL_MS - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await pendingCashLookup('ride:r1', load, t + PENDING_CASH_LOOKUP_TTL_MS + 1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a failed lookup is not kept', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('ride-service down')).mockResolvedValue({ driverId: 'd1' });
    await expect(pendingCashLookup('ride:r1', load)).rejects.toThrow('ride-service down');
    await expect(pendingCashLookup('ride:r1', load)).resolves.toEqual({ driverId: 'd1' });
  });
});
