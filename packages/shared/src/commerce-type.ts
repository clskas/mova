/** Types de commerce partenaires (même compte auth RESTAURANT, affichage distinct). */
export const COMMERCE_TYPES = ['RESTAURANT', 'SUPERMARKET', 'PHARMACY', 'BOUTIQUE'] as const;
export type CommerceTypeValue = (typeof COMMERCE_TYPES)[number];

export const COMMERCE_TYPE_LABELS_FR: Record<CommerceTypeValue, string> = {
  RESTAURANT: 'Restaurant',
  SUPERMARKET: 'Supermarché',
  PHARMACY: 'Pharmacie',
  BOUTIQUE: 'Boutique',
};

export function isCommerceType(value: unknown): value is CommerceTypeValue {
  return typeof value === 'string' && (COMMERCE_TYPES as readonly string[]).includes(value);
}

export function parseCommerceType(
  value: unknown,
  fallback: CommerceTypeValue = 'RESTAURANT',
): CommerceTypeValue {
  return isCommerceType(value) ? value : fallback;
}

export function commerceTypeLabel(value?: string | null): string {
  return COMMERCE_TYPE_LABELS_FR[parseCommerceType(value)];
}

/** Resolve admin search text (Pharmacie, Boutique, …) to a commerce type. */
export function commerceTypeFromSearch(q?: string | null): CommerceTypeValue | undefined {
  if (!q?.trim()) return undefined;
  const key = q
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const aliases: Record<string, CommerceTypeValue> = {
    pharmacie: 'PHARMACY',
    pharmacy: 'PHARMACY',
    boutique: 'BOUTIQUE',
    boutiques: 'BOUTIQUE',
    supermarche: 'SUPERMARKET',
    supermarket: 'SUPERMARKET',
    'super-marche': 'SUPERMARKET',
    restaurant: 'RESTAURANT',
    restaurants: 'RESTAURANT',
    resto: 'RESTAURANT',
    restos: 'RESTAURANT',
  };
  if (aliases[key]) return aliases[key];
  const upper = q.trim().toUpperCase();
  return isCommerceType(upper) ? upper : undefined;
}

/** Libellé affiché pour un compte utilisateur (rôle auth + type de commerce). */
export function userRoleDisplayLabel(role?: string | null, commerceType?: string | null): string {
  const r = String(role ?? '').trim().toUpperCase();
  if (r === 'RESTAURANT') return commerceTypeLabel(commerceType);
  const labels: Record<string, string> = {
    PASSENGER: 'Passager',
    DRIVER: 'Chauffeur',
    RENTAL_PARTNER: 'Partenaire location',
    ADMIN: 'Administrateur',
    SUPER_ADMIN: 'Super admin',
    SUPPORT: 'Support',
    FINANCE: 'Finance',
    CONTENT: 'Contenu',
    CITY_ADMIN: 'Admin ville',
  };
  return labels[r] ?? (r ? r.replace(/_/g, ' ').toLowerCase() : '—');
}
