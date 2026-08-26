/** Demo partner phones — never auto-register as PASSENGER after a DB wipe. */
export const PARTNER_SEED_PHONES = {
  restaurant: '+243900000030',
  rental: '+243900000031',
} as const;

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

/** Staff (admin console) accounts must exist in Admin before OTP login. */
export function isInviteOnlyAuthRole(role?: string | null): boolean {
  return isStaffAuthRole(role);
}

/**
 * Refuse creating a PASSENGER (or unspecified-role) account.
 * Partner portals self-register; staff stays invite-only.
 */
export function shouldRefusePassengerAutoRegister(phone: string, role?: string | null): boolean {
  if (isStaffAuthRole(role)) return true;
  if (isPartnerPortalRole(role)) return false;
  return phone === PARTNER_SEED_PHONES.restaurant || phone === PARTNER_SEED_PHONES.rental;
}

export function canPromoteToPartnerRole(currentRole: string, requested?: string | null): boolean {
  return isPartnerPortalRole(requested) && currentRole === 'PASSENGER';
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
  if (isStaffAuthRole(role)) {
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
