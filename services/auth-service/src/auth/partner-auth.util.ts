/** Demo partner phones — never auto-register as PASSENGER after a DB wipe. */
export const PARTNER_SEED_PHONES = {
  restaurant: '+243900000030',
  rental: '+243900000031',
} as const;

/** Production owner — keep SUPER_ADMIN even after seed / DB restore. */
export const OWNER_SUPER_ADMIN_PHONE = '+243971163574';

/** Only this Gmail may use Google on admin.afri-soft.com (linked to OWNER_SUPER_ADMIN_PHONE). */
export const OWNER_SUPER_ADMIN_EMAIL = 'celestinkas@gmail.com';

export function isOwnerSuperAdminEmail(email?: string | null): boolean {
  return (email ?? '').trim().toLowerCase() === OWNER_SUPER_ADMIN_EMAIL;
}

const STAFF_ROLES: ReadonlySet<string> = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'SUPPORT',
  'FINANCE',
  'CONTENT',
]);

const PARTNER_PORTAL_ROLES: ReadonlySet<string> = new Set(['RESTAURANT', 'RENTAL_PARTNER']);

export const PARTNER_PORTALS = ['restaurant', 'rental'] as const;
export type PartnerPortalId = (typeof PARTNER_PORTALS)[number];

export function isStaffAuthRole(role?: string | null): boolean {
  return !!role && STAFF_ROLES.has(role);
}

export function isPartnerPortalRole(role?: string | null): boolean {
  return !!role && PARTNER_PORTAL_ROLES.has(role);
}

const SELF_REGISTER_ROLES: ReadonlySet<string> = new Set([
  'PASSENGER',
  'RESTAURANT',
  'RENTAL_PARTNER',
]);

export type SelfRegisterRole = 'PASSENGER' | 'RESTAURANT' | 'RENTAL_PARTNER';

/**
 * Restaurant / rental first login may create that partner role — only when the
 * portal (or explicit role) is sent from those clients. SENGA web/app omit both.
 */
export function isAllowedPartnerSelfRegisterRole(role?: string | null): boolean {
  return role === 'RESTAURANT' || role === 'RENTAL_PARTNER';
}

export function roleFromPartnerPortal(portal?: string | null): 'RESTAURANT' | 'RENTAL_PARTNER' | undefined {
  if (portal === 'restaurant') return 'RESTAURANT';
  if (portal === 'rental') return 'RENTAL_PARTNER';
  return undefined;
}

/** Allowlist only. SUPER_ADMIN / ADMIN / DRIVER / unknown → undefined (cannot mint staff). */
export function sanitizeIntendedAuthRole(role?: string | null): SelfRegisterRole | undefined {
  if (role == null || role === '') return undefined;
  const trimmed = String(role).trim().toUpperCase();
  if (SELF_REGISTER_ROLES.has(trimmed)) return trimmed as SelfRegisterRole;
  return undefined;
}

/** Staff (admin console) must exist before OTP / Google login. Partners may self-register. */
export function isInviteOnlyAuthRole(role?: string | null): boolean {
  return isStaffAuthRole(role);
}

/**
 * Refuse creating a PASSENGER from OTP. Staff stay invite-only. Seed partner /
 * owner phones must never auto-register as PASSENGER after a DB wipe.
 * Partner portal roles are handled separately (create RESTAURANT / RENTAL_PARTNER).
 */
export function shouldRefusePassengerAutoRegister(phone: string, role?: string | null): boolean {
  if (isStaffAuthRole(role)) return true;
  if (isAllowedPartnerSelfRegisterRole(role)) return false;
  return (
    phone === PARTNER_SEED_PHONES.restaurant ||
    phone === PARTNER_SEED_PHONES.rental ||
    phone === OWNER_SUPER_ADMIN_PHONE
  );
}

/** OTP / PIN / Google must never promote an existing PASSENGER → partner. */
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
