import {
  canPromoteToPartnerRole,
  defaultPartnerDisplayName,
  isAllowedPartnerSelfRegisterRole,
  isInviteOnlyAuthRole,
  isPartnerPortalRole,
  isStaffAuthRole,
  missingInviteOnlyAccountMessage,
  isOwnerSuperAdminEmail,
  OWNER_SUPER_ADMIN_EMAIL,
  OWNER_SUPER_ADMIN_PHONE,
  PARTNER_SEED_PHONES,
  roleFromPartnerPortal,
  sanitizeIntendedAuthRole,
  shouldRefusePassengerAutoRegister,
} from './partner-auth.util';

describe('partner-auth.util', () => {
  it('allows restaurant and rental portal self-register (not as PASSENGER)', () => {
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'RESTAURANT')).toBe(false);
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'RENTAL_PARTNER')).toBe(false);
    expect(isAllowedPartnerSelfRegisterRole('RESTAURANT')).toBe(true);
    expect(isAllowedPartnerSelfRegisterRole('RENTAL_PARTNER')).toBe(true);
    expect(isAllowedPartnerSelfRegisterRole('PASSENGER')).toBe(false);
    expect(isAllowedPartnerSelfRegisterRole('ADMIN')).toBe(false);
    expect(isInviteOnlyAuthRole('RESTAURANT')).toBe(false);
    expect(isInviteOnlyAuthRole('RENTAL_PARTNER')).toBe(false);
    expect(roleFromPartnerPortal('restaurant')).toBe('RESTAURANT');
    expect(roleFromPartnerPortal('rental')).toBe('RENTAL_PARTNER');
    expect(roleFromPartnerPortal(undefined)).toBeUndefined();
    expect(sanitizeIntendedAuthRole('PASSENGER')).toBe('PASSENGER');
    expect(sanitizeIntendedAuthRole('RESTAURANT')).toBe('RESTAURANT');
    expect(sanitizeIntendedAuthRole('RENTAL_PARTNER')).toBe('RENTAL_PARTNER');
    expect(sanitizeIntendedAuthRole('SUPER_ADMIN')).toBeUndefined();
    expect(sanitizeIntendedAuthRole('ADMIN')).toBeUndefined();
    expect(sanitizeIntendedAuthRole('DRIVER')).toBeUndefined();
  });

  it('allowlists only celestinkas@gmail.com as owner Google email', () => {
    expect(OWNER_SUPER_ADMIN_EMAIL).toBe('celestinkas@gmail.com');
    expect(isOwnerSuperAdminEmail('celestinkas@gmail.com')).toBe(true);
    expect(isOwnerSuperAdminEmail('CELESTINKAS@gmail.com')).toBe(true);
    expect(isOwnerSuperAdminEmail('afriri75@gmail.com')).toBe(false);
  });

  it('still refuses staff auto-register', () => {
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'ADMIN')).toBe(true);
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'SUPER_ADMIN')).toBe(true);
    expect(isInviteOnlyAuthRole('ADMIN')).toBe(true);
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

  it('allows passenger auto-register on unknown phones (not driver/partner)', () => {
    expect(shouldRefusePassengerAutoRegister('+243811111111')).toBe(false);
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'PASSENGER')).toBe(false);
    expect(shouldRefusePassengerAutoRegister('+243811111111', 'DRIVER')).toBe(false);
  });

  it('never promotes an existing role via OTP', () => {
    expect(canPromoteToPartnerRole('PASSENGER', 'RESTAURANT')).toBe(false);
    expect(canPromoteToPartnerRole('PASSENGER', 'RENTAL_PARTNER')).toBe(false);
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

  it('tells staff to use the admin portal instead of restaurant', async () => {
    const { mismatchedPartnerRoleMessage, STAFF_ON_PARTNER_PORTAL_MESSAGE } = await import('./partner-auth.util');
    expect(mismatchedPartnerRoleMessage('RESTAURANT', 'SUPER_ADMIN')).toBe(STAFF_ON_PARTNER_PORTAL_MESSAGE);
    expect(STAFF_ON_PARTNER_PORTAL_MESSAGE).toMatch(/déjà administrateur/);
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
