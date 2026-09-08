import { partnerConnectionPinMode, partnerNeedsKycActivationPin } from './partner-connection-pin';

describe('partnerConnectionPinMode', () => {
  it('shows the KYC login PIN after Google or phone when a PIN was issued', () => {
    expect(
      partnerConnectionPinMode({
        pinConfigured: true,
        kycStatus: 'APPROVED',
        unlocked: false,
        identity: 'resto@gmail.com',
      }),
    ).toBe('enter');
    expect(
      partnerConnectionPinMode({
        pinConfigured: true,
        kycStatus: 'PENDING',
        unlocked: false,
        identity: 'resto@gmail.com',
      }),
    ).toBe('enter');
    expect(
      partnerConnectionPinMode({
        pinConfigured: true,
        kycStatus: undefined,
        unlocked: false,
      }),
    ).toBe('enter');
  });

  it('does not invent a create-PIN screen when no login PIN exists yet', () => {
    expect(
      partnerConnectionPinMode({
        pinConfigured: false,
        kycStatus: 'PENDING',
        unlocked: false,
        identity: 'resto@gmail.com',
      }),
    ).toBeNull();
    expect(
      partnerConnectionPinMode({
        pinConfigured: false,
        kycStatus: 'APPROVED',
        unlocked: false,
        identity: '+243812345678',
      }),
    ).toBeNull();
    expect(
      partnerConnectionPinMode({
        pinConfigured: undefined,
        kycStatus: null,
        unlocked: false,
      }),
    ).toBeNull();
  });

  it('falls back to enter when pinConfigured is unknown but KYC is approved', () => {
    expect(
      partnerConnectionPinMode({
        pinConfigured: undefined,
        kycStatus: 'approved',
        canOperate: true,
        unlocked: false,
      }),
    ).toBe('enter');
  });

  it('does not show the window after the PIN is confirmed', () => {
    expect(
      partnerConnectionPinMode({
        pinConfigured: true,
        kycStatus: 'APPROVED',
        unlocked: true,
      }),
    ).toBeNull();
    expect(
      partnerNeedsKycActivationPin({
        pinConfigured: true,
        unlocked: true,
      }),
    ).toBe(false);
  });

  it('skips seed demo phones', () => {
    expect(
      partnerConnectionPinMode({
        pinConfigured: true,
        kycStatus: 'APPROVED',
        unlocked: false,
        identity: '+243900000010',
      }),
    ).toBeNull();
  });
});
