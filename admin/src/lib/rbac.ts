/** Rôles staff autorisés sur la console admin SENGA. */
export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "FINANCE" | "CONTENT" | "CITY_ADMIN";

export type AdminSection =
  | "dashboard"
  | "utilisateurs"
  | "chauffeurs"
  | "kyc"
  | "courses"
  | "livraisons"
  | "restaurants"
  | "tarifs"
  | "regles"
  | "litiges"
  | "fraude"
  | "planifiees"
  | "abonnements"
  | "promos"
  | "portefeuille"
  | "parametres"
  | "lieux"
  | "locations"
  | "demenagements"
  | "covoiturage"
  | "publicites"
  | "contacts"
  | "cgu"
  | "systeme";

export const ADMIN_ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "FINANCE", "CONTENT", "CITY_ADMIN"];

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Administrateur",
  SUPPORT: "Support",
  FINANCE: "Finance",
  CONTENT: "Contenu",
  CITY_ADMIN: "Admin ville",
};

/** Niveaux d’accès éditables (alignés @mova/shared ADMIN_ACCESS_LEVELS). */
export const ACCESS_LEVEL_OPTIONS: { id: string; label: string; sections: AdminSection[] }[] = [
  { id: "dashboard", label: "Tableau de bord", sections: ["dashboard"] },
  { id: "utilisateurs", label: "Utilisateurs", sections: ["utilisateurs"] },
  { id: "chauffeurs", label: "Chauffeurs", sections: ["chauffeurs"] },
  { id: "kyc", label: "KYC", sections: ["kyc"] },
  { id: "courses", label: "Courses", sections: ["courses"] },
  { id: "livraisons", label: "Livraisons", sections: ["livraisons"] },
  { id: "restaurants", label: "Restaurants / partenaires", sections: ["restaurants"] },
  { id: "tarifs", label: "Tarifs", sections: ["tarifs"] },
  { id: "regles", label: "Règles plateforme", sections: ["regles"] },
  { id: "zones", label: "Zones géographiques", sections: ["parametres"] },
  { id: "lieux", label: "Lieux et POI", sections: ["lieux"] },
  { id: "litiges", label: "Litiges / SOS", sections: ["litiges"] },
  { id: "fraude", label: "Fraude", sections: ["fraude"] },
  { id: "planifiees", label: "Courses planifiées", sections: ["planifiees"] },
  { id: "locations", label: "Locations", sections: ["locations"] },
  { id: "demenagements", label: "Déménagements", sections: ["demenagements"] },
  { id: "covoiturage", label: "Covoiturage", sections: ["covoiturage"] },
  { id: "abonnements", label: "Abonnements", sections: ["abonnements"] },
  /** Affiche /tarifs (bloc codes promo) ; l’API reste gated par promo:read/write. */
  { id: "promos", label: "Codes promo", sections: ["tarifs"] },
  { id: "portefeuille", label: "Portefeuille", sections: ["portefeuille"] },
  { id: "publicites", label: "Publicités", sections: ["publicites"] },
  { id: "contacts", label: "Contacts", sections: ["contacts"] },
  { id: "cgu", label: "CGU", sections: ["cgu"] },
  { id: "systeme", label: "Système (maintenance, MM, SOS ops)", sections: ["systeme"] },
];

const ALL_SECTIONS: AdminSection[] = [
  "dashboard",
  "utilisateurs",
  "chauffeurs",
  "kyc",
  "courses",
  "livraisons",
  "restaurants",
  "tarifs",
  "regles",
  "litiges",
  "fraude",
  "planifiees",
  "abonnements",
  "promos",
  "portefeuille",
  "parametres",
  "lieux",
  "locations",
  "demenagements",
  "covoiturage",
  "publicites",
  "contacts",
  "cgu",
  "systeme",
];

/** Sections visibles dans le menu par rôle. */
const ROLE_SECTIONS: Record<AdminRole, AdminSection[]> = {
  SUPER_ADMIN: ALL_SECTIONS,
  ADMIN: ALL_SECTIONS.filter((s) => s !== "systeme"),
  SUPPORT: [
    "utilisateurs",
    "chauffeurs",
    "kyc",
    "litiges",
    "fraude",
    "courses",
    "livraisons",
    "planifiees",
    "locations",
    "demenagements",
    "covoiturage",
  ],
  FINANCE: ["dashboard", "portefeuille", "tarifs", "regles", "abonnements", "promos"],
  CONTENT: ["restaurants", "tarifs", "parametres", "lieux", "locations", "publicites"],
  CITY_ADMIN: [
    "dashboard",
    "chauffeurs",
    "kyc",
    "courses",
    "livraisons",
    "restaurants",
    "litiges",
    "planifiees",
    "locations",
    "demenagements",
    "covoiturage",
    "tarifs",
    "regles",
    "parametres",
    "lieux",
  ],
};

/** Sections où l'utilisateur peut modifier des données. */
const ROLE_WRITE: Record<AdminRole, AdminSection[]> = {
  SUPER_ADMIN: ALL_SECTIONS,
  ADMIN: ALL_SECTIONS.filter((s) => s !== "portefeuille" && s !== "systeme"),
  SUPPORT: ["kyc", "litiges", "courses", "livraisons", "planifiees", "locations", "demenagements", "covoiturage"],
  FINANCE: ["tarifs", "regles", "abonnements", "promos", "portefeuille"],
  CONTENT: ["restaurants", "locations", "publicites"],
  CITY_ADMIN: [
    "dashboard",
    "chauffeurs",
    "kyc",
    "courses",
    "livraisons",
    "restaurants",
    "litiges",
    "locations",
    "tarifs",
    "regles",
    "parametres",
    "lieux",
  ],
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
  { href: "/contacts", label: "Contacts", short: "Contacts", section: "contacts" },
  { href: "/cgu", label: "CGU", short: "CGU", section: "cgu" },
  { href: "/operateurs-mm", label: "Opérateurs Mobile Money", short: "MM", section: "systeme" },
  { href: "/services-senga", label: "Services SENGA", short: "Serv.", section: "systeme" },
  { href: "/abonnements-externes", label: "Hébergements & plateformes", short: "Échéances", section: "systeme" },
  { href: "/alertes-sos", label: "Alertes SOS", short: "SOS", section: "systeme" },
  { href: "/maintenance", label: "Mode maintenance", short: "Maint.", section: "systeme" },
  { href: "/courses", label: "Courses", short: "Courses", section: "courses" },
  { href: "/livraisons", label: "Livraisons", short: "Livr.", section: "livraisons" },
  { href: "/restaurants", label: "Restaurants", short: "Restos", section: "restaurants" },
  { href: "/publicites", label: "Publicités", short: "Pubs", section: "publicites" },
  { href: "/tarifs", label: "Tarifs", short: "Tarifs", section: "tarifs" },
  { href: "/regles-plateforme", label: "Règles plateforme", short: "Règles", section: "regles" },
  { href: "/abonnements", label: "Abonnements", short: "Abos", section: "abonnements" },
  { href: "/portefeuille", label: "Portefeuille", short: "Portef.", section: "portefeuille" },
  { href: "/litiges", label: "Litiges", short: "Litiges", section: "litiges" },
  { href: "/fraude", label: "Fraude", short: "Fraude", section: "fraude" },
  { href: "/planifiees", label: "Planifiées", short: "Planif.", section: "planifiees" },
  { href: "/parametres", label: "Zones géographiques", short: "Zones", section: "parametres" },
  { href: "/lieux", label: "Lieux & POI", short: "Lieux", section: "lieux" },
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

export function defaultAccessLevelIdsForRole(role: AdminRole): string[] {
  const sections = new Set(ROLE_SECTIONS[role]);
  return ACCESS_LEVEL_OPTIONS.filter((lvl) => lvl.sections.some((s) => sections.has(s))).map((lvl) => lvl.id);
}

export function sectionsFromAccessLevelIds(levelIds: string[]): AdminSection[] {
  const wanted = new Set(levelIds);
  const out = new Set<AdminSection>();
  for (const lvl of ACCESS_LEVEL_OPTIONS) {
    if (!wanted.has(lvl.id)) continue;
    for (const s of lvl.sections) out.add(s);
  }
  return Array.from(out);
}

export function canAccessSection(
  role: AdminRole,
  section: AdminSection,
  accessLevelIds?: string[] | null,
): boolean {
  if (accessLevelIds && accessLevelIds.length > 0) {
    return sectionsFromAccessLevelIds(accessLevelIds).includes(section);
  }
  return ROLE_SECTIONS[role].includes(section);
}

export function canWriteSection(
  role: AdminRole,
  section: AdminSection,
  accessLevelIds?: string[] | null,
): boolean {
  if (!canAccessSection(role, section, accessLevelIds)) return false;
  if (accessLevelIds && accessLevelIds.length > 0) {
    if (role === "SUPER_ADMIN") return true;
    return ROLE_WRITE[role].includes(section) || role === "ADMIN";
  }
  return ROLE_WRITE[role].includes(section);
}

export function navForRole(role: AdminRole, accessLevelIds?: string[] | null): NavItem[] {
  return NAV_ITEMS.filter((item) => canAccessSection(role, item.section, accessLevelIds));
}

export function sectionFromPath(pathname: string): AdminSection | null {
  if (pathname === "/") return "dashboard";
  const item = NAV_ITEMS.find((n) => n.href !== "/" && pathname.startsWith(n.href));
  return item?.section ?? null;
}

export function defaultPathForRole(role: AdminRole, accessLevelIds?: string[] | null): string {
  const items = navForRole(role, accessLevelIds);
  return items[0]?.href ?? "/";
}

export function roleBadgeClass(role: AdminRole): string {
  const map: Record<AdminRole, string> = {
    SUPER_ADMIN: "bg-violet-600 text-white",
    ADMIN: "bg-[#6C63FF] text-white",
    SUPPORT: "bg-sky-600 text-white",
    FINANCE: "bg-emerald-600 text-white",
    CONTENT: "bg-amber-600 text-white",
    CITY_ADMIN: "bg-teal-700 text-white",
  };
  return map[role];
}
