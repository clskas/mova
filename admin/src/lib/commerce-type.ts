/** Types de commerce partenaires (même rôle auth RESTAURANT, affichage distinct). */
export type CommerceTypeValue = "RESTAURANT" | "SUPERMARKET" | "PHARMACY" | "BOUTIQUE";

export const COMMERCE_TYPE_LABELS_FR: Record<CommerceTypeValue, string> = {
  RESTAURANT: "Restaurant",
  SUPERMARKET: "Supermarché",
  PHARMACY: "Pharmacie",
  BOUTIQUE: "Boutique",
};

export function parseCommerceType(value?: string | null): CommerceTypeValue {
  const upper = String(value ?? "").trim().toUpperCase();
  if (upper in COMMERCE_TYPE_LABELS_FR) return upper as CommerceTypeValue;
  return "RESTAURANT";
}

export function commerceTypeLabel(value?: string | null): string {
  return COMMERCE_TYPE_LABELS_FR[parseCommerceType(value)];
}

/** Libellé affiché pour un compte (rôle auth + type de commerce). */
export function userRoleDisplayLabel(role?: string | null, commerceType?: string | null): string {
  const r = String(role ?? "").trim().toUpperCase();
  if (r === "RESTAURANT") return commerceTypeLabel(commerceType);
  const labels: Record<string, string> = {
    PASSENGER: "Passager",
    DRIVER: "Chauffeur",
    RENTAL_PARTNER: "Partenaire location",
    ADMIN: "Administrateur",
    SUPER_ADMIN: "Super admin",
    SUPPORT: "Support",
    FINANCE: "Finance",
    CONTENT: "Contenu",
    CITY_ADMIN: "Admin ville",
  };
  return labels[r] ?? (r ? r.replace(/_/g, " ").toLowerCase() : "—");
}
