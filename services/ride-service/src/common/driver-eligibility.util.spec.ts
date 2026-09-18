import { driverAcceptsDeliveries, driverCanReceiveJobs, type DriverProfileSnapshot } from './driver-eligibility.util';

describe('driverCanReceiveJobs', () => {
  const base: DriverProfileSnapshot = {
    kycStatus: 'APPROVED',
    activationPinVerified: true,
    documentsStatus: { canOperate: true },
  };

  it('allows an activated KYC-approved driver with valid documents', () => {
    expect(driverCanReceiveJobs(base)).toBe(true);
  });

  it('rejects KYC-approved drivers who have not entered the activation PIN', () => {
    expect(driverCanReceiveJobs({ ...base, activationPinVerified: false, activationPinVerifiedAt: null })).toBe(
      false,
    );
  });

  it('rejects pending KYC', () => {
    expect(driverCanReceiveJobs({ ...base, kycStatus: 'PENDING' })).toBe(false);
  });
});

describe('driverAcceptsDeliveries', () => {
  it('defaults to livreur SENGA when flag is missing', () => {
    expect(driverAcceptsDeliveries({})).toBe(true);
    expect(driverAcceptsDeliveries(null)).toBe(true);
  });

  it('respects ride-only admin flag', () => {
    expect(driverAcceptsDeliveries({ acceptsDeliveries: false })).toBe(false);
    expect(driverAcceptsDeliveries({ acceptsDeliveries: true })).toBe(true);
  });
});

describe('filterDriversAcceptingDeliveries', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetModules();
  });

  it('keeps livreurs and drops ride-only chauffeurs', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      const id = String(url).split('/').pop() ?? '';
      return {
        ok: true,
        json: async () => ({ acceptsDeliveries: id !== 'ride-only-user' }),
      } as Response;
    }) as unknown as typeof fetch;

    const { filterDriversAcceptingDeliveries } = await import('./driver-eligibility.util');
    const kept = await filterDriversAcceptingDeliveries(['livreur-user', 'ride-only-user']);
    expect(kept).toEqual(['livreur-user']);
  });
});
