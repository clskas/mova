/** Rôles staff autorisés sur la console admin SENGA. */
export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "FINANCE" | "CONTENT";

export type AdminSection =
  | "dashboard"
  | "utilisateurs"
  | "chauffeurs"
  | "kyc"
  | "courses"
  | "livraisons"
  | "restaurants"
  | "tarifs"
  | "litiges"
  | "fraude"
  | "planifiees"
  | "abonnements"
  | "portefeuille"
  | "parametres"
  | "locations"
  | "demenagements"
  | "covoiturage"
  | "publicites";

export const ADMIN_ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "FINANCE", "CONTENT"];

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Administrateur",
  SUPPORT: "Support",
  FINANCE: "Finance",
  CONTENT: "Contenu",
};

const ALL_SECTIONS: AdminSection[] = [
  "dashboard",
  "utilisateurs",
  "chauffeurs",
  "kyc",
  "courses",
  "livraisons",
  "restaurants",
  "tarifs",
  "litiges",
  "fraude",
  "planifiees",
  "abonnements",
  "portefeuille",
  "parametres",
  "locations",
  "demenagements",
  "covoiturage",
  "publicites",
];

/** Sections visibles dans le menu par rôle. */
const ROLE_SECTIONS: Record<AdminRole, AdminSection[]> = {
  SUPER_ADMIN: ALL_SECTIONS,
  ADMIN: ALL_SECTIONS,
  SUPPORT: ["utilisateurs", "chauffeurs", "kyc", "litiges", "fraude", "courses", "livraisons", "planifiees", "locations", "demenagements", "covoiturage"],
  FINANCE: ["dashboard", "portefeuille", "tarifs", "abonnements"],
  CONTENT: ["restaurants", "tarifs", "parametres", "locations", "publicites"],
};

/** Sections où l'utilisateur peut modifier des données. */
const ROLE_WRITE: Record<AdminRole, AdminSection[]> = {
  SUPER_ADMIN: ALL_SECTIONS,
  ADMIN: ALL_SECTIONS.filter((s) => s !== "portefeuille"),
  SUPPORT: ["kyc", "litiges", "courses", "livraisons", "planifiees", "locations", "demenagements", "covoiturage"],
  FINANCE: ["tarifs", "abonnements", "portefeuille"],
  CONTENT: ["restaurants", "locations", "publicites"],
};

export type NavItem = {
  href: string;
  label: string;
  short: string;
  section: AdminSection;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tableau de bord", short: "Accueil", section: "dashboard" },
  { href: "/utilisateurs", label: "Utilisateurs", short: "Utilis.", section: "utilisateurs" },
  { href: "/chauffeurs", label: "Chauffeurs", short: "Chauff.", section: "chauffeurs" },
  { href: "/kyc", label: "KYC", short: "KYC", section: "kyc" },
  { href: "/courses", label: "Courses", short: "Courses", section: "courses" },
  { href: "/livraisons", label: "Livraisons", short: "Livr.", section: "livraisons" },
  { href: "/restaurants", label: "Restaurants", short: "Restos", section: "restaurants" },
  { href: "/publicites", label: "Publicités", short: "Pubs", section: "publicites" },
  { href: "/tarifs", label: "Tarifs", short: "Tarifs", section: "tarifs" },
  { href: "/regles-plateforme", label: "Règles plateforme", short: "Règles", section: "tarifs" },
  { href: "/abonnements", label: "Abonnements", short: "Abos", section: "abonnements" },
  { href: "/portefeuille", label: "Portefeuille", short: "Portef.", section: "portefeuille" },
  { href: "/litiges", label: "Litiges", short: "Litiges", section: "litiges" },
  { href: "/fraude", label: "Fraude", short: "Fraude", section: "fraude" },
  { href: "/planifiees", label: "Planifiées", short: "Planif.", section: "planifiees" },
  { href: "/parametres", label: "Zones géographiques", short: "Zones", section: "parametres" },
  { href: "/lieux", label: "Lieux & POI", short: "Lieux", section: "parametres" },
  { href: "/locations", label: "Locations", short: "Loc.", section: "locations" },
  { href: "/catalogue-location", label: "Catalogue location", short: "Catal.", section: "locations" },
  { href: "/demenagements", label: "Déménagements", short: "Démén.", section: "demenagements" },
  { href: "/covoiturage", label: "Covoiturage", short: "Covoit.", section: "covoiturage" },
];

export function normalizeAdminRole(role?: string | null): AdminRole | null {
  if (!role) return null;
  const upper = role.toUpperCase();
  return ADMIN_ROLES.includes(upper as AdminRole) ? (upper as AdminRole) : null;
}

export function isAdminRole(role?: string | null): boolean {
  return normalizeAdminRole(role) !== null;
}

export function canAccessSection(role: AdminRole, section: AdminSection): boolean {
  return ROLE_SECTIONS[role].includes(section);
}

export function canWriteSection(role: AdminRole, section: AdminSection): boolean {
  return ROLE_WRITE[role].includes(section);
}

export function navForRole(role: AdminRole): NavItem[] {
  return NAV_ITEMS.filter((item) => canAccessSection(role, item.section));
}

export function sectionFromPath(pathname: string): AdminSection | null {
  if (pathname === "/") return "dashboard";
  const item = NAV_ITEMS.find((n) => n.href !== "/" && pathname.startsWith(n.href));
  return item?.section ?? null;
}

export function defaultPathForRole(role: AdminRole): string {
  const items = navForRole(role);
  return items[0]?.href ?? "/";
}

export function roleBadgeClass(role: AdminRole): string {
  const map: Record<AdminRole, string> = {
    SUPER_ADMIN: "bg-violet-600 text-white",
    ADMIN: "bg-[#6C63FF] text-white",
    SUPPORT: "bg-sky-600 text-white",
    FINANCE: "bg-emerald-600 text-white",
    CONTENT: "bg-amber-600 text-white",
  };
  return map[role];
}
