/** Demo partner phones — never auto-register as PASSENGER after a DB wipe. */
export const PARTNER_SEED_PHONES = {
  restaurant: '+243900000030',
  rental: '+243900000031',
} as const;

/** Production owner — keep SUPER_ADMIN even after seed / DB restore. */
export const OWNER_SUPER_ADMIN_PHONE = '+243971163574';

const STAFF_ROLES: ReadonlySet<string> = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'SUPPORT',
  'FINANCE',
  'CONTENT',
]);

const PARTNER_PORTAL_ROLES: ReadonlySet<string> = new Set(['RESTAURANT', 'RENTAL_PARTNER']);

export function isStaffAuthRole(role?: string | null): boolean {
  return !!role && STAFF_ROLES.has(role);
}

export function isPartnerPortalRole(role?: string | null): boolean {
  return !!role && PARTNER_PORTAL_ROLES.has(role);
}

/** Staff (admin console) and partner portal accounts must exist before OTP login. */
export function isInviteOnlyAuthRole(role?: string | null): boolean {
  return isStaffAuthRole(role) || isPartnerPortalRole(role);
}

/**
 * Refuse creating an account from OTP when the portal is invite-only.
 * Staff and partner portals must already exist (admin-created). Seed partner /
 * owner phones must never auto-register as PASSENGER after a DB wipe.
 */
export function shouldRefusePassengerAutoRegister(phone: string, role?: string | null): boolean {
  if (isStaffAuthRole(role) || isPartnerPortalRole(role)) return true;
  return (
    phone === PARTNER_SEED_PHONES.restaurant ||
    phone === PARTNER_SEED_PHONES.rental ||
    phone === OWNER_SUPER_ADMIN_PHONE
  );
}

/** OTP / PIN must never promote PASSENGER → partner. Admin creates the account. */
export function canPromoteToPartnerRole(_currentRole?: string, _requested?: string | null): boolean {
  return false;
}

export function defaultPartnerDisplayName(role?: string | null): string {
  if (role === 'RESTAURANT') return 'Mon restaurant';
  if (role === 'RENTAL_PARTNER') return 'Ma flotte';
  return '';
}

export function missingInviteOnlyAccountMessage(phone: string, role?: string | null): string {
  if (role === 'RENTAL_PARTNER' || phone === PARTNER_SEED_PHONES.rental) {
    return "Aucun compte partenaire location pour ce numéro. Créez le partenaire dans l'admin SENGA (rôle Partenaire location) avant la première connexion.";
  }
  if (role === 'RESTAURANT' || phone === PARTNER_SEED_PHONES.restaurant) {
    return "Aucun compte partenaire restaurant pour ce numéro. Créez le partenaire dans l'admin SENGA (rôle Restaurant) avant la première connexion.";
  }
  if (isStaffAuthRole(role) || phone === OWNER_SUPER_ADMIN_PHONE) {
    return "Aucun compte staff pour ce numéro. Créez-le d'abord dans l'admin SENGA.";
  }
  return "Ce numéro n'a pas de compte. Créez-le d'abord dans l'admin SENGA.";
}

export function mismatchedPartnerRoleMessage(requested: string, actual: string): string {
  if (requested === 'RESTAURANT') {
    return `Ce compte n'est pas un partenaire restaurant (rôle: ${actual}). Corrigez le rôle dans l'admin SENGA.`;
  }
  if (requested === 'RENTAL_PARTNER') {
    return `Ce compte n'est pas un partenaire location (rôle: ${actual}). Corrigez le rôle dans l'admin SENGA.`;
  }
  return `Ce compte n'a pas le rôle requis (${requested}, actuel: ${actual}).`;
}
