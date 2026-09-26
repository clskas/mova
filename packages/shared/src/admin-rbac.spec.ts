import { AdminPermission, hasAdminPermission } from './admin-rbac';
import { UserRole } from './enums';

describe('admin-rbac', () => {
  it('autorise SUPER_ADMIN sur toutes les permissions', () => {
    expect(hasAdminPermission(UserRole.SUPER_ADMIN, AdminPermission.USERS_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.SUPER_ADMIN, AdminPermission.USERS_DELETE)).toBe(true);
    expect(hasAdminPermission(UserRole.SUPER_ADMIN, AdminPermission.SUBSCRIPTIONS_WRITE)).toBe(true);
  });

  it('seul SUPER_ADMIN peut supprimer définitivement un utilisateur', () => {
    expect(hasAdminPermission(UserRole.ADMIN, AdminPermission.USERS_DELETE)).toBe(false);
    expect(hasAdminPermission(UserRole.SUPPORT, AdminPermission.USERS_DELETE)).toBe(false);
    expect(hasAdminPermission(UserRole.FINANCE, AdminPermission.USERS_DELETE)).toBe(false);
  });

  it('restreint CONTENT aux restaurants et tarifs lecture', () => {
    expect(hasAdminPermission(UserRole.CONTENT, AdminPermission.RESTAURANTS_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.CONTENT, AdminPermission.PRICING_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.CONTENT, AdminPermission.USERS_READ)).toBe(false);
  });

  it('autorise FINANCE sur pricing et abonnements', () => {
    expect(hasAdminPermission(UserRole.FINANCE, AdminPermission.PRICING_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.FINANCE, AdminPermission.SUBSCRIPTIONS_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.FINANCE, AdminPermission.KYC_WRITE)).toBe(false);
  });

  it('refuse PASSENGER sur le panneau admin', () => {
    expect(hasAdminPermission(UserRole.PASSENGER, AdminPermission.METRICS_READ)).toBe(false);
  });

  it('ADMIN ne peut pas écrire les portefeuilles (FINANCE / SUPER_ADMIN seulement)', () => {
    expect(hasAdminPermission(UserRole.ADMIN, AdminPermission.WALLETS_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.ADMIN, AdminPermission.WALLETS_WRITE)).toBe(false);
    expect(hasAdminPermission(UserRole.FINANCE, AdminPermission.WALLETS_WRITE)).toBe(true);
  });

  it('SUPPORT ne peut pas suspendre utilisateurs ni écrire pricing', () => {
    expect(hasAdminPermission(UserRole.SUPPORT, AdminPermission.USERS_WRITE)).toBe(false);
    expect(hasAdminPermission(UserRole.SUPPORT, AdminPermission.PRICING_WRITE)).toBe(false);
  });

  it('CITY_ADMIN : ops ville (tarifs/chauffeurs/KYC), pas system/wallets', () => {
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.METRICS_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.USERS_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.RIDES_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.RESTAURANTS_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.SCHEDULED_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.KYC_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.KYC_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.DRIVERS_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.PRICING_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.PRICING_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.ZONES_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.POI_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.POI_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.RULES_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.RENTALS_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.RENTALS_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.MOVING_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.MOVING_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.WALLETS_WRITE)).toBe(false);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.SYSTEM_WRITE)).toBe(false);
    expect(hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.USERS_WRITE)).toBe(false);
  });

  it('contacts entreprise : SUPER_ADMIN et ADMIN seulement', () => {
    expect(hasAdminPermission(UserRole.SUPER_ADMIN, AdminPermission.CONTACTS_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.SUPER_ADMIN, AdminPermission.CONTACTS_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.ADMIN, AdminPermission.CONTACTS_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.ADMIN, AdminPermission.CONTACTS_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.SUPPORT, AdminPermission.CONTACTS_READ)).toBe(false);
    expect(hasAdminPermission(UserRole.SUPPORT, AdminPermission.CONTACTS_WRITE)).toBe(false);
    expect(hasAdminPermission(UserRole.FINANCE, AdminPermission.CONTACTS_READ)).toBe(false);
    expect(hasAdminPermission(UserRole.CONTENT, AdminPermission.CONTACTS_READ)).toBe(false);
  });

  it('CGU : SUPER_ADMIN et ADMIN seulement', () => {
    expect(hasAdminPermission(UserRole.SUPER_ADMIN, AdminPermission.CGU_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.SUPER_ADMIN, AdminPermission.CGU_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.SUPER_ADMIN, AdminPermission.SYSTEM_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.SUPER_ADMIN, AdminPermission.SYSTEM_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.ADMIN, AdminPermission.CGU_READ)).toBe(true);
    expect(hasAdminPermission(UserRole.ADMIN, AdminPermission.CGU_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.ADMIN, AdminPermission.SYSTEM_WRITE)).toBe(false);
    expect(hasAdminPermission(UserRole.SUPPORT, AdminPermission.CGU_READ)).toBe(false);
    expect(hasAdminPermission(UserRole.CONTENT, AdminPermission.CGU_WRITE)).toBe(false);
  });

  it('applique un override de permissions custom', () => {
    expect(
      hasAdminPermission(UserRole.SUPPORT, AdminPermission.WALLETS_READ, [
        AdminPermission.WALLETS_READ,
      ]),
    ).toBe(true);
    expect(hasAdminPermission(UserRole.SUPPORT, AdminPermission.WALLETS_READ)).toBe(false);
  });

  it('legacy zones:write implique poi:write (avant séparation Lieux)', () => {
    expect(
      hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.POI_WRITE, [
        AdminPermission.ZONES_READ,
        AdminPermission.ZONES_WRITE,
      ]),
    ).toBe(true);
    expect(
      hasAdminPermission(UserRole.CITY_ADMIN, AdminPermission.POI_READ, [
        AdminPermission.ZONES_READ,
      ]),
    ).toBe(true);
  });
});
