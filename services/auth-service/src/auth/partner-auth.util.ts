/** Demo partner phones — never auto-register as PASSENGER after a DB wipe. */
export const PARTNER_SEED_PHONES = {
  restaurant: '+243900000030',
  rental: '+243900000031',
} as const;

const INVITE_ONLY_ROLES: ReadonlySet<string> = new Set([
  'RESTAURANT',
  'RENTAL_PARTNER',
  'SUPER_ADMIN',
  'ADMIN',
  'SUPPORT',
  'FINANCE',
  'CONTENT',
]);

export function isInviteOnlyAuthRole(role?: string | null): boolean {
  return !!role && INVITE_ONLY_ROLES.has(role);
}

/** Partner / staff accounts must exist in Admin before OTP login. */
export function shouldRefusePassengerAutoRegister(phone: string, role?: string | null): boolean {
  if (isInviteOnlyAuthRole(role)) return true;
  return phone === PARTNER_SEED_PHONES.restaurant || phone === PARTNER_SEED_PHONES.rental;
}

export function missingInviteOnlyAccountMessage(phone: string, role?: string | null): string {
  if (role === 'RENTAL_PARTNER' || phone === PARTNER_SEED_PHONES.rental) {
    return "Aucun compte partenaire location pour ce numéro. Créez le partenaire dans l'admin SENGA (rôle Partenaire location) avant la première connexion.";
  }
  if (role === 'RESTAURANT' || phone === PARTNER_SEED_PHONES.restaurant) {
    return "Aucun compte partenaire restaurant pour ce numéro. Créez le partenaire dans l'admin SENGA (rôle Restaurant) avant la première connexion.";
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
