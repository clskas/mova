jest.mock('./driver-eligibility.util', () => ({ fetchDriverProfileSnapshot: jest.fn() }));
jest.mock('./driver-debt.util', () => ({ fetchDriverDebtStatus: jest.fn() }));

import { fetchDriverDebtStatus } from './driver-debt.util';
import { fetchDriverProfileSnapshot } from './driver-eligibility.util';
import { __clearOffersLookupCache, OFFERS_LOOKUP_TTL_MS, offersDriverDebtStatus, offersDriverProfile } from './offers-lookup-cache';

const profile = fetchDriverProfileSnapshot as jest.Mock;
const debt = fetchDriverDebtStatus as jest.Mock;

describe('offers lookup cache', () => {
  beforeEach(() => {
    __clearOffersLookupCache();
    profile.mockReset().mockResolvedValue({ userId: 'd1', kycStatus: 'APPROVED' });
    debt.mockReset().mockResolvedValue({ offersBlocked: false });
  });
  afterEach(() => jest.useRealTimers());

  it('one call per driver for the ride, delivery and errand lists polled together', async () => {
    await Promise.all([offersDriverProfile('d1'), offersDriverProfile('d1'), offersDriverProfile('d1')]);
    await Promise.all([offersDriverDebtStatus('d1'), offersDriverDebtStatus('d1')]);
    expect(profile).toHaveBeenCalledTimes(1);
    expect(debt).toHaveBeenCalledTimes(1);
    await offersDriverProfile('d2');
    expect(profile).toHaveBeenCalledTimes(2);
  });

  it('asks again once the 10 s are over', async () => {
    jest.useFakeTimers();
    await offersDriverProfile('d1');
    jest.setSystemTime(Date.now() + OFFERS_LOOKUP_TTL_MS + 1);
    await offersDriverProfile('d1');
    expect(profile).toHaveBeenCalledTimes(2);
  });

  it('a failed lookup is not kept', async () => {
    profile.mockRejectedValueOnce(new Error('driver-service down'));
    await expect(offersDriverProfile('d1')).rejects.toThrow('driver-service down');
    await expect(offersDriverProfile('d1')).resolves.toMatchObject({ userId: 'd1' });
  });
});
