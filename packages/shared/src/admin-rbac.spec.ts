import { AdminPermission, hasAdminPermission } from './admin-rbac';
import { UserRole } from './enums';

describe('admin-rbac', () => {
  it('autorise SUPER_ADMIN sur toutes les permissions', () => {
    expect(hasAdminPermission(UserRole.SUPER_ADMIN, AdminPermission.USERS_WRITE)).toBe(true);
    expect(hasAdminPermission(UserRole.SUPER_ADMIN, AdminPermission.SUBSCRIPTIONS_WRITE)).toBe(true);
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
});
