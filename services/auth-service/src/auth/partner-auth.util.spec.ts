import {
  missingInviteOnlyAccountMessage,
  PARTNER_SEED_PHONES,
  shouldRefusePassengerAutoRegister,
} from './partner-auth.util';

describe('partner-auth.util', () => {
  it('refuses auto-register when partner role is requested', () => {
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'RESTAURANT')).toBe(true);
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'RENTAL_PARTNER')).toBe(true);
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'ADMIN')).toBe(true);
  });

  it('refuses auto-register for seed partner phones even without a role', () => {
    expect(shouldRefusePassengerAutoRegister(PARTNER_SEED_PHONES.restaurant)).toBe(true);
    expect(shouldRefusePassengerAutoRegister(PARTNER_SEED_PHONES.rental)).toBe(true);
  });

  it('allows passenger/driver auto-register on unknown phones', () => {
    expect(shouldRefusePassengerAutoRegister('+243811111111')).toBe(false);
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'PASSENGER')).toBe(false);
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'DRIVER')).toBe(false);
  });

  it('explains that Admin must create the partner first', () => {
    expect(missingInviteOnlyAccountMessage(PARTNER_SEED_PHONES.restaurant, 'RESTAURANT')).toMatch(/admin SENGA/);
    expect(missingInviteOnlyAccountMessage(PARTNER_SEED_PHONES.rental, 'RENTAL_PARTNER')).toMatch(/Partenaire location/);
  });
});
