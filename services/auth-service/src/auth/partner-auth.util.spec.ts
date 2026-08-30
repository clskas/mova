import {
  canPromoteToPartnerRole,
  defaultPartnerDisplayName,
  isInviteOnlyAuthRole,
  isPartnerPortalRole,
  isStaffAuthRole,
  missingInviteOnlyAccountMessage,
  OWNER_SUPER_ADMIN_PHONE,
  PARTNER_SEED_PHONES,
  shouldRefusePassengerAutoRegister,
} from './partner-auth.util';

describe('partner-auth.util', () => {
  it('allows restaurant and rental portals to self-register', () => {
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'RESTAURANT')).toBe(false);
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'RENTAL_PARTNER')).toBe(false);
    expect(shouldRefusePassengerAutoRegister(PARTNER_SEED_PHONES.restaurant, 'RESTAURANT')).toBe(false);
    expect(shouldRefusePassengerAutoRegister(PARTNER_SEED_PHONES.rental, 'RENTAL_PARTNER')).toBe(false);
  });

  it('still refuses staff auto-register', () => {
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'ADMIN')).toBe(true);
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'SUPER_ADMIN')).toBe(true);
    expect(isInviteOnlyAuthRole('ADMIN')).toBe(true);
    expect(isInviteOnlyAuthRole('RESTAURANT')).toBe(false);
    expect(isInviteOnlyAuthRole('RENTAL_PARTNER')).toBe(false);
  });

  it('refuses auto-register for seed partner phones without a portal role', () => {
    expect(shouldRefusePassengerAutoRegister(PARTNER_SEED_PHONES.restaurant)).toBe(true);
    expect(shouldRefusePassengerAutoRegister(PARTNER_SEED_PHONES.rental)).toBe(true);
    expect(shouldRefusePassengerAutoRegister(PARTNER_SEED_PHONES.restaurant, 'PASSENGER')).toBe(true);
  });

  it('refuses passenger auto-register for the production owner phone', () => {
    expect(shouldRefusePassengerAutoRegister(OWNER_SUPER_ADMIN_PHONE)).toBe(true);
    expect(shouldRefusePassengerAutoRegister(OWNER_SUPER_ADMIN_PHONE, 'PASSENGER')).toBe(true);
    expect(missingInviteOnlyAccountMessage(OWNER_SUPER_ADMIN_PHONE)).toMatch(/compte staff/);
  });

  it('allows passenger/driver auto-register on unknown phones', () => {
    expect(shouldRefusePassengerAutoRegister('+243811111111')).toBe(false);
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'PASSENGER')).toBe(false);
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'DRIVER')).toBe(false);
  });

  it('promotes only PASSENGER into a portal role', () => {
    expect(canPromoteToPartnerRole('PASSENGER', 'RESTAURANT')).toBe(true);
    expect(canPromoteToPartnerRole('PASSENGER', 'RENTAL_PARTNER')).toBe(true);
    expect(canPromoteToPartnerRole('DRIVER', 'RESTAURANT')).toBe(false);
    expect(canPromoteToPartnerRole('ADMIN', 'RENTAL_PARTNER')).toBe(false);
    expect(canPromoteToPartnerRole('RESTAURANT', 'RENTAL_PARTNER')).toBe(false);
  });

  it('uses editable default display names', () => {
    expect(defaultPartnerDisplayName('RESTAURANT')).toBe('Mon restaurant');
    expect(defaultPartnerDisplayName('RENTAL_PARTNER')).toBe('Ma flotte');
  });

  it('explains that Admin must create staff first', () => {
    expect(missingInviteOnlyAccountMessage('+243811111111', 'ADMIN')).toMatch(/compte staff/);
  });

  it('treats all admin console roles as staff', () => {
    expect(isStaffAuthRole('ADMIN')).toBe(true);
    expect(isStaffAuthRole('SUPER_ADMIN')).toBe(true);
    expect(isStaffAuthRole('RENTAL_PARTNER')).toBe(false);
    expect(isPartnerPortalRole('RESTAURANT')).toBe(true);
    expect(isPartnerPortalRole('RENTAL_PARTNER')).toBe(true);
    expect(isPartnerPortalRole('ADMIN')).toBe(false);
  });
});
