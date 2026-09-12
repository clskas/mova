export type CommerceType = "RESTAURANT" | "SUPERMARKET" | "PHARMACY" | "BOUTIQUE";

export const COMMERCE_TYPE_LABELS_FR: Record<CommerceType, string> = {
  RESTAURANT: "Restaurant",
  SUPERMARKET: "Supermarché",
  PHARMACY: "Pharmacie",
  BOUTIQUE: "Boutique",
};

export function parseCommerceType(value: unknown): CommerceType {
  if (value === "SUPERMARKET" || value === "PHARMACY" || value === "BOUTIQUE" || value === "RESTAURANT") {
    return value;
  }
  return "RESTAURANT";
}

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: string;
  badgeKey: null | "pending";
};

const COMMON_BEFORE: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", short: "Accueil", icon: "📊", badgeKey: null },
  { href: "/", label: "Commandes", short: "Commandes", icon: "🧾", badgeKey: "pending" },
];

const COMMON_AFTER: NavItem[] = [
  { href: "/earnings", label: "Revenus", short: "Revenus", icon: "💰", badgeKey: null },
  { href: "/dossier", label: "Mon dossier", short: "Dossier", icon: "📁", badgeKey: null },
  { href: "/promos", label: "Codes promo", short: "Promos", icon: "🏷️", badgeKey: null },
  { href: "/compte", label: "Compte et connexion", short: "Compte", icon: "👤", badgeKey: null },
  { href: "/settings", label: "Paramètres", short: "Réglages", icon: "⚙️", badgeKey: null },
  { href: "/aide", label: "Aide / Manuel", short: "Aide", icon: "❓", badgeKey: null },
];

function typeSpecificNav(commerceType: CommerceType): NavItem[] {
  switch (commerceType) {
    case "SUPERMARKET":
    case "BOUTIQUE":
      return [
        { href: "/catalogue", label: "Catalogue", short: "Catalogue", icon: "📦", badgeKey: null },
        { href: "/stock", label: "Stock", short: "Stock", icon: "🗃️", badgeKey: null },
      ];
    case "PHARMACY":
      return [
        { href: "/catalogue", label: "Catalogue", short: "Catalogue", icon: "📦", badgeKey: null },
        { href: "/restrictions", label: "Restrictions", short: "Règles", icon: "🛡️", badgeKey: null },
      ];
    case "RESTAURANT":
    default:
      return [{ href: "/menu", label: "Menu", short: "Menu", icon: "🍽️", badgeKey: null }];
  }
}

export function navItemsForCommerceType(commerceType: CommerceType): NavItem[] {
  return [...COMMON_BEFORE, ...typeSpecificNav(commerceType), ...COMMON_AFTER];
}
