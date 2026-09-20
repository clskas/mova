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

export type CommerceCopy = {
  storeNoun: string;
  storeNounPlural: string;
  itemNoun: string;
  itemNounPlural: string;
  catalogNoun: string;
  catalogHref: string;
  emptyOrders: string;
  /** Escrow line for aide/manuel ("L'argent est bloqué…"). */
  paidAtPickupEscrow: string;
  /** Pay-on-pickup line for aide/manuel ("Vous êtes payé quand…"). */
  paidAtPickupPay: string;
  specialtyLabel: string;
  nameLabel: string;
  loginWrongRole: string;
  dossierVisibility: string;
  promosBlurb: string;
  /** Full settings footer sentence including catalog link wording. */
  settingsCatalogHint: string;
  settingsCatalogLinkLabel: string;
  /** Short hint under commerce-type selector in settings. */
  portalNavHint: string;
  guideSubtitle: string;
  aideIntro: string;
  dossierBeforeTitle: string;
  dossierBeforeCatalogStep: string;
  catalogAndOrdersTitle: string;
  addItemsStep: string;
  scopeMenuOnly: string;
  scopeFullOrder: string;
  chatSubtitle: string;
  visibilityGps: string;
  specialtyPlaceholder: string;
};

const LOGIN_WRONG_ROLE =
  "Ce compte n'est pas un partenaire commerce. Utilisez le compte SENGA Business adapté à votre établissement.";

export function commerceCopy(type: CommerceType): CommerceCopy {
  const t = parseCommerceType(type);

  if (t === "RESTAURANT") {
    return {
      storeNoun: "restaurant",
      storeNounPlural: "restaurants",
      itemNoun: "plat",
      itemNounPlural: "plats",
      catalogNoun: "Menu",
      catalogHref: "/menu",
      emptyOrders: "Rien en cuisine pour le moment",
      paidAtPickupEscrow: "L'argent est bloqué jusqu'au départ du plat.",
      paidAtPickupPay: "Vous êtes payé quand la commande est prise au restaurant.",
      specialtyLabel: "Cuisine / spécialité",
      nameLabel: "Nom du restaurant",
      loginWrongRole: LOGIN_WRONG_ROLE,
      dossierVisibility:
        "SENGA vérifie votre identité, votre activité et votre local avant d'afficher le restaurant et d'accepter des commandes.",
      promosBlurb:
        "Créez des codes valables uniquement pour votre restaurant. La remise est toujours déduite de votre part — SENGA et le livreur ne la financent pas.",
      settingsCatalogHint: "Gérez les plats et photos dans l'onglet Menu.",
      settingsCatalogLinkLabel: "Menu",
      portalNavHint: "Change le menu du portail (Menu).",
      guideSubtitle: "Guide restaurant SENGA — Kinshasa, RDC.",
      aideIntro: "Manuel restaurant et contacts AfriSoft.",
      dossierBeforeTitle: "Dossier avant menus et commandes",
      dossierBeforeCatalogStep:
        "Tant que le dossier n'est pas validé, vous ne pouvez pas vendre ni afficher le menu.",
      catalogAndOrdersTitle: "Menus et commandes",
      addItemsStep: "Une fois le dossier validé, ajoutez vos plats dans Menu.",
      scopeMenuOnly: "Plats uniquement",
      scopeFullOrder: "Commande complète (plats + livraison)",
      chatSubtitle: "Messages visibles par client, livreur et restaurant",
      visibilityGps:
        "Les clients voient les restaurants proches de leur adresse de livraison. Une position précise améliore votre visibilité.",
      specialtyPlaceholder: "Ex. Congolaise",
    };
  }

  const storeNoun =
    t === "SUPERMARKET" ? "supermarché" : t === "PHARMACY" ? "pharmacie" : "boutique";
  const storeNounPlural =
    t === "SUPERMARKET" ? "supermarchés" : t === "PHARMACY" ? "pharmacies" : "boutiques";
  const feminine = t === "PHARMACY" || t === "BOUTIQUE";
  const nameLabel =
    t === "SUPERMARKET"
      ? "Nom du supermarché"
      : t === "PHARMACY"
        ? "Nom de la pharmacie"
        : "Nom de la boutique";
  const typeLabel = COMMERCE_TYPE_LABELS_FR[t].toLowerCase();
  const atStore = feminine ? `à la ${storeNoun}` : `au ${storeNoun}`;
  const theStore = feminine ? `la ${storeNoun}` : `le ${storeNoun}`;

  const portalNavHint =
    t === "PHARMACY"
      ? "Change le menu du portail (Catalogue, Restrictions)."
      : "Change le menu du portail (Catalogue, Stock).";

  return {
    storeNoun,
    storeNounPlural,
    itemNoun: "article",
    itemNounPlural: "articles",
    catalogNoun: "Catalogue",
    catalogHref: "/catalogue",
    emptyOrders: "Aucune commande en préparation pour le moment",
    paidAtPickupEscrow: "L'argent est bloqué jusqu'au départ de la commande.",
    paidAtPickupPay: `Vous êtes payé quand la commande est prise ${atStore}.`,
    specialtyLabel: "Spécialité / rayon",
    nameLabel,
    loginWrongRole: LOGIN_WRONG_ROLE,
    dossierVisibility: `SENGA vérifie votre identité, votre activité et votre local avant d'afficher ${theStore} et d'accepter des commandes.`,
    promosBlurb: `Créez des codes valables uniquement pour votre ${storeNoun}. La remise est toujours déduite de votre part — SENGA et le livreur ne la financent pas.`,
    settingsCatalogHint: "Gérez les articles et photos dans l'onglet Catalogue.",
    settingsCatalogLinkLabel: "Catalogue",
    portalNavHint,
    guideSubtitle: `Guide ${typeLabel} SENGA — Kinshasa, RDC.`,
    aideIntro: `Manuel ${typeLabel} et contacts AfriSoft.`,
    dossierBeforeTitle: "Dossier avant catalogue et commandes",
    dossierBeforeCatalogStep:
      "Tant que le dossier n'est pas validé, vous ne pouvez pas vendre ni afficher le catalogue.",
    catalogAndOrdersTitle: "Catalogue et commandes",
    addItemsStep: "Une fois le dossier validé, ajoutez vos articles dans Catalogue.",
    scopeMenuOnly: "Articles uniquement",
    scopeFullOrder: "Commande complète (articles + livraison)",
    chatSubtitle: `Messages visibles par client, livreur et ${storeNoun}`,
    visibilityGps: `Les clients voient les ${storeNounPlural} proches de leur adresse de livraison. Une position précise améliore votre visibilité.`,
    specialtyPlaceholder: "Ex. Épicerie, Mode…",
  };
}

/** Shared aide/manuel chapters, wording adapted to commerce type. */
export function commerceHelpChapters(type: CommerceType) {
  const c = commerceCopy(type);
  return [
    {
      title: "Code PIN de connexion",
      steps: [
        "Connectez-vous sur https://restaurant.afri-soft.com/login avec Google ou votre téléphone.",
        "Première fois : code SMS (téléphone) ou code e-mail (après Google), puis PIN de connexion (6 chiffres) pour les prochaines fois.",
        "Après Déconnexion : pavé Connexion — « Entrez le PIN pour +243 ••• XXX », 6 points, clavier. Google ne reconnecte pas tout seul.",
        "Après validation du dossier : fenêtre « Code PIN d'activation » pour commencer à travailler.",
      ],
    },
    {
      title: c.dossierBeforeTitle,
      steps: [
        "Ouvrez Mon dossier en premier.",
        "Envoyez vos justificatifs (activité, identité, local).",
        "Attendez la validation SENGA.",
        c.dossierBeforeCatalogStep,
      ],
    },
    {
      title: "Livraison par SENGA",
      steps: [
        "SENGA gère tous les livreurs : vous ne choisissez pas de flotte interne.",
        "Quand la commande est prête, un livreur SENGA vient la chercher.",
        "Vous êtes payé à l'enlèvement ; le livreur est payé après le PIN client.",
      ],
    },
    {
      title: "Paiement à l'enlèvement",
      steps: [
        "Le client paie d'abord (portefeuille ou Mobile Money).",
        c.paidAtPickupEscrow,
        c.paidAtPickupPay,
        "Un livreur SENGA est payé après le code PIN du client.",
      ],
    },
    {
      title: c.catalogAndOrdersTitle,
      steps: [
        c.addItemsStep,
        "Ouvrez Commandes pour préparer et suivre.",
        "Dans Paramètres, indiquez si vous acceptez les commandes.",
      ],
    },
  ];
}

/** Longer manuel chapters (first-login detail + shared commerce steps). */
export function commerceManuelChapters(type: CommerceType) {
  const c = commerceCopy(type);
  return [
    {
      title: "Première connexion et PIN",
      steps: [
        "Ouvrez https://restaurant.afri-soft.com/login — Google, ou téléphone / e-mail. Ce n'est pas l'écran « Activer le compte ».",
        "Téléphone : un code SMS arrive, puis la fenêtre PIN de connexion (6 chiffres) : « Choisissez / confirmez votre PIN de connexion pour les prochaines fois ».",
        "Google : après Google, un code arrive par e-mail (objet « Votre accès SENGA Business », sans le mot OTP). Saisissez-le, puis la même fenêtre PIN de connexion.",
        "Après Déconnexion, le pavé Connexion s'affiche : « Entrez le PIN pour +243 ••• XXX », 6 points, clavier. Google ne reconnecte pas tout seul.",
        "Après validation SENGA, une fenêtre « Code PIN d'activation » bloque le tableau de bord. Saisissez le PIN reçu par e-mail / SMS pour commencer à travailler.",
        "Si le PIN n'arrive pas, l'équipe SENGA le renvoie depuis l'admin — vérifiez aussi le spam Gmail.",
      ],
    },
    {
      title: c.dossierBeforeTitle,
      steps: [
        "Ouvrez Mon dossier en premier.",
        "Envoyez vos justificatifs (activité, identité, local).",
        "Attendez la validation SENGA.",
        c.dossierBeforeCatalogStep,
      ],
    },
    {
      title: "Livraison par SENGA",
      steps: [
        "SENGA gère tous les livreurs : vous ne choisissez pas de flotte interne.",
        "Quand la commande est prête, un livreur SENGA vient la chercher.",
        "Vous êtes payé à l'enlèvement ; le livreur est payé après le PIN client.",
      ],
    },
    {
      title: "Paiement à l'enlèvement",
      steps: [
        "Le client paie d'abord (portefeuille ou Mobile Money).",
        c.paidAtPickupEscrow,
        c.paidAtPickupPay,
        "Un livreur SENGA est payé après le code PIN du client.",
      ],
    },
    {
      title: c.catalogAndOrdersTitle,
      steps: [
        c.addItemsStep,
        "Ouvrez Commandes pour préparer et suivre.",
        "Dans Paramètres, indiquez si vous acceptez les commandes.",
      ],
    },
  ];
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
        { href: "/restrictions", label: "Restrictions", short: "Règles", icon: "🛡️", badgeKey: null },
      ];
    case "PHARMACY":
      return [
        { href: "/catalogue", label: "Catalogue", short: "Catalogue", icon: "📦", badgeKey: null },
        { href: "/restrictions", label: "Restrictions", short: "Règles", icon: "🛡️", badgeKey: null },
      ];
    case "RESTAURANT":
    default:
      return [
        { href: "/menu", label: "Menu", short: "Menu", icon: "🍽️", badgeKey: null },
        { href: "/restrictions", label: "Restrictions", short: "Règles", icon: "🛡️", badgeKey: null },
      ];
  }
}

export function navItemsForCommerceType(commerceType: CommerceType): NavItem[] {
  return [...COMMON_BEFORE, ...typeSpecificNav(commerceType), ...COMMON_AFTER];
}
