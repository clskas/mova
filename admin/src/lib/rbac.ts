/** Rôles staff autorisés sur la console admin MOVA. */
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
  | "covoiturage";

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
];

/** Sections visibles dans le menu par rôle. */
const ROLE_SECTIONS: Record<AdminRole, AdminSection[]> = {
  SUPER_ADMIN: ALL_SECTIONS,
  ADMIN: ALL_SECTIONS,
  SUPPORT: ["utilisateurs", "chauffeurs", "kyc", "litiges", "fraude", "courses", "livraisons", "planifiees", "locations", "demenagements", "covoiturage"],
  FINANCE: ["dashboard", "portefeuille", "tarifs", "abonnements"],
  CONTENT: ["restaurants", "tarifs", "parametres", "locations"],
};

/** Sections où l'utilisateur peut modifier des données. */
const ROLE_WRITE: Record<AdminRole, AdminSection[]> = {
  SUPER_ADMIN: ALL_SECTIONS,
  ADMIN: ALL_SECTIONS,
  SUPPORT: ["kyc", "litiges", "livraisons", "planifiees", "locations", "demenagements", "covoiturage"],
  FINANCE: ["tarifs", "abonnements", "portefeuille"],
  CONTENT: ["restaurants", "tarifs", "parametres", "locations"],
};

export type NavItem = {
  href: string;
  label: string;
  section: AdminSection;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tableau de bord", section: "dashboard" },
  { href: "/utilisateurs", label: "Utilisateurs", section: "utilisateurs" },
  { href: "/chauffeurs", label: "Chauffeurs", section: "chauffeurs" },
  { href: "/kyc", label: "KYC", section: "kyc" },
  { href: "/courses", label: "Courses", section: "courses" },
  { href: "/livraisons", label: "Livraisons", section: "livraisons" },
  { href: "/restaurants", label: "Restaurants", section: "restaurants" },
  { href: "/tarifs", label: "Tarifs", section: "tarifs" },
  { href: "/abonnements", label: "Abonnements", section: "abonnements" },
  { href: "/portefeuille", label: "Portefeuille", section: "portefeuille" },
  { href: "/litiges", label: "Litiges", section: "litiges" },
  { href: "/fraude", label: "Fraude", section: "fraude" },
  { href: "/planifiees", label: "Planifiées", section: "planifiees" },
  { href: "/parametres", label: "Communes", section: "parametres" },
  { href: "/locations", label: "Locations", section: "locations" },
  { href: "/catalogue-location", label: "Catalogue location", section: "locations" },
  { href: "/demenagements", label: "Déménagements", section: "demenagements" },
  { href: "/covoiturage", label: "Covoiturage", section: "covoiturage" },
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
