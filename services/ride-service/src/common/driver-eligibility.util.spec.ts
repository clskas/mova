import { driverCanReceiveJobs, type DriverProfileSnapshot } from './driver-eligibility.util';

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
