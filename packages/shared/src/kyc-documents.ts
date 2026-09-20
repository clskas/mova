/** Types de documents KYC chauffeur — alignés sur le parcours d'enregistrement SENGA. */
export const KYC_DOCUMENT_TYPES = {
  ID_PHOTO: 'ID_PHOTO',
  SELFIE: 'SELFIE',
  DRIVERS_LICENSE: 'DRIVERS_LICENSE',
  VEHICLE_REGISTRATION: 'VEHICLE_REGISTRATION',
  VEHICLE_INSURANCE: 'VEHICLE_INSURANCE',
  TECHNICAL_INSPECTION: 'TECHNICAL_INSPECTION',
  FISCAL_STICKER: 'FISCAL_STICKER',
  CRIMINAL_RECORD: 'CRIMINAL_RECORD',
} as const;

export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[keyof typeof KYC_DOCUMENT_TYPES];

export const KYC_DOCUMENT_LABELS: Record<KycDocumentType, string> = {
  ID_PHOTO: 'Carte d\'identité / passeport',
  SELFIE: 'Photo récente (profil)',
  DRIVERS_LICENSE: 'Permis de conduire',
  VEHICLE_REGISTRATION: 'Carte rose',
  VEHICLE_INSURANCE: 'Assurance véhicule',
  TECHNICAL_INSPECTION: 'Visite technique',
  FISCAL_STICKER: 'Vignette fiscale',
  CRIMINAL_RECORD: 'Extrait casier judiciaire',
};

/**
 * Documents obligatoires pour le dossier chauffeur.
 * Vide par défaut : tous les justificatifs sont optionnels.
 * Quand l'admin active « documents requis pour les courses », l'ops gate
 * (dates d'expiration / canOperate) s'applique via PlatformConfig — pas cette liste.
 */
export const REQUIRED_DRIVER_KYC_TYPES: KycDocumentType[] = [];

/** Tous les justificatifs chauffeur sont déposables librement (aucun obligatoire). */
export const OPTIONAL_DRIVER_KYC_TYPES: KycDocumentType[] = [
  KYC_DOCUMENT_TYPES.ID_PHOTO,
  KYC_DOCUMENT_TYPES.SELFIE,
  KYC_DOCUMENT_TYPES.DRIVERS_LICENSE,
  KYC_DOCUMENT_TYPES.VEHICLE_REGISTRATION,
  KYC_DOCUMENT_TYPES.VEHICLE_INSURANCE,
  KYC_DOCUMENT_TYPES.TECHNICAL_INSPECTION,
  KYC_DOCUMENT_TYPES.FISCAL_STICKER,
  KYC_DOCUMENT_TYPES.CRIMINAL_RECORD,
];

/**
 * Dossier restaurant (RDC) — l'admin vérifie avant mise en ligne :
 * identité du gérant (carte d'électeur / passeport), RCCM ou preuve d'activité,
 * NIF si disponible, photos / adresse du local, téléphone +243, coordonnées Mobile Money.
 */
export const PARTNER_KYC_DOCUMENT_TYPES = {
  MANAGER_ID: 'MANAGER_ID',
  RCCM: 'RCCM',
  NIF: 'NIF',
  PREMISES_PHOTO: 'PREMISES_PHOTO',
  PAYOUT_PROOF: 'PAYOUT_PROOF',
  COMPANY_STATUTES: 'COMPANY_STATUTES',
  HEADQUARTERS_PROOF: 'HEADQUARTERS_PROOF',
  ADDRESS_PROOF: 'ADDRESS_PROOF',
} as const;

export type PartnerKycDocumentType =
  (typeof PARTNER_KYC_DOCUMENT_TYPES)[keyof typeof PARTNER_KYC_DOCUMENT_TYPES];

export const PARTNER_KYC_DOCUMENT_LABELS: Record<PartnerKycDocumentType, string> = {
  MANAGER_ID: 'Identité du gérant (carte d\'électeur / passeport)',
  RCCM: 'RCCM ou preuve d\'activité',
  NIF: 'NIF (si disponible)',
  PREMISES_PHOTO: 'Adresse / photos du local',
  PAYOUT_PROOF: 'Preuve des coordonnées de paiement',
  COMPANY_STATUTES: 'Statuts ou agrément',
  HEADQUARTERS_PROOF: 'Preuve de siège',
  ADDRESS_PROOF: 'Preuve d\'adresse',
};

/**
 * Documents obligatoires à l'activation partenaire — vide par défaut
 * (activation possible sans justificatif). Quand l'admin active
 * « documents requis pour les courses », voir JOBS_GATE_* ci-dessous.
 */
export const REQUIRED_RESTAURANT_KYC_TYPES: PartnerKycDocumentType[] = [];

export const OPTIONAL_RESTAURANT_KYC_TYPES: PartnerKycDocumentType[] = [
  PARTNER_KYC_DOCUMENT_TYPES.MANAGER_ID,
  PARTNER_KYC_DOCUMENT_TYPES.RCCM,
  PARTNER_KYC_DOCUMENT_TYPES.PREMISES_PHOTO,
  PARTNER_KYC_DOCUMENT_TYPES.NIF,
  PARTNER_KYC_DOCUMENT_TYPES.PAYOUT_PROOF,
];

export const REQUIRED_RENTAL_COMPANY_KYC_TYPES: PartnerKycDocumentType[] = [];

export const OPTIONAL_RENTAL_COMPANY_KYC_TYPES: PartnerKycDocumentType[] = [
  PARTNER_KYC_DOCUMENT_TYPES.RCCM,
  PARTNER_KYC_DOCUMENT_TYPES.COMPANY_STATUTES,
  PARTNER_KYC_DOCUMENT_TYPES.MANAGER_ID,
  PARTNER_KYC_DOCUMENT_TYPES.HEADQUARTERS_PROOF,
  PARTNER_KYC_DOCUMENT_TYPES.NIF,
];

export const REQUIRED_RENTAL_INDIVIDUAL_KYC_TYPES: KycDocumentType[] = [];

export const OPTIONAL_RENTAL_INDIVIDUAL_KYC_TYPES: PartnerKycDocumentType[] = [
  PARTNER_KYC_DOCUMENT_TYPES.ADDRESS_PROOF,
];

/** Types exigés si PlatformConfig.driverOps.requireDocumentsForJobs = true
 *  et qu'aucune liste admin personnalisée n'est définie. */
export const JOBS_GATE_RESTAURANT_KYC_TYPES: PartnerKycDocumentType[] = [
  PARTNER_KYC_DOCUMENT_TYPES.MANAGER_ID,
  PARTNER_KYC_DOCUMENT_TYPES.RCCM,
  PARTNER_KYC_DOCUMENT_TYPES.PREMISES_PHOTO,
];

export const JOBS_GATE_RENTAL_COMPANY_KYC_TYPES: PartnerKycDocumentType[] = [
  PARTNER_KYC_DOCUMENT_TYPES.RCCM,
  PARTNER_KYC_DOCUMENT_TYPES.COMPANY_STATUTES,
  PARTNER_KYC_DOCUMENT_TYPES.MANAGER_ID,
  PARTNER_KYC_DOCUMENT_TYPES.HEADQUARTERS_PROOF,
];

export const JOBS_GATE_RENTAL_INDIVIDUAL_KYC_TYPES: Array<KycDocumentType | PartnerKycDocumentType> = [
  KYC_DOCUMENT_TYPES.ID_PHOTO,
];

/** Catalogue admin : groupes de justificatifs (case à cocher « obligatoire »). */
export type AdminDocumentCatalogGroup = {
  id: KycPartnerKind;
  label: string;
  documents: Array<{ type: string; label: string }>;
};

export function adminDocumentCatalog(): AdminDocumentCatalogGroup[] {
  return [
    {
      id: 'DRIVER',
      label: 'Chauffeurs',
      documents: OPTIONAL_DRIVER_KYC_TYPES.map((type) => ({
        type,
        label: KYC_DOCUMENT_LABELS[type],
      })),
    },
    {
      id: 'RESTAURANT',
      label: 'Restaurants / boutiques',
      documents: OPTIONAL_RESTAURANT_KYC_TYPES.map((type) => ({
        type,
        label: PARTNER_KYC_DOCUMENT_LABELS[type],
      })),
    },
    {
      id: 'RENTAL_COMPANY',
      label: 'Location (entreprise)',
      documents: OPTIONAL_RENTAL_COMPANY_KYC_TYPES.map((type) => ({
        type,
        label: PARTNER_KYC_DOCUMENT_LABELS[type],
      })),
    },
    {
      id: 'RENTAL_INDIVIDUAL',
      label: 'Location (particulier)',
      documents: [
        {
          type: KYC_DOCUMENT_TYPES.ID_PHOTO,
          label: KYC_DOCUMENT_LABELS[KYC_DOCUMENT_TYPES.ID_PHOTO],
        },
        ...OPTIONAL_RENTAL_INDIVIDUAL_KYC_TYPES.map((type) => ({
          type,
          label: PARTNER_KYC_DOCUMENT_LABELS[type],
        })),
      ],
    },
  ];
}

export type DocumentsOpsConfig = {
  requireDocumentsForJobs?: boolean;
  /** Jours après création du compte avant blocage des notifs (0 = immédiat). */
  documentsGracePeriodDays?: number;
  requiredDriverDocuments?: string[];
  requiredRestaurantDocuments?: string[];
  requiredRentalCompanyDocuments?: string[];
  requiredRentalIndividualDocuments?: string[];
};

const MS_PER_DAY = 86_400_000;

export function normalizeDocumentTypeList(raw?: string[] | null): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const type = String(item ?? '')
      .trim()
      .toUpperCase();
    if (!type || seen.has(type)) continue;
    seen.add(type);
    out.push(type);
  }
  return out;
}

/** True si le délai de grâce est écoulé (blocage autorisé). */
export function documentsGraceElapsed(
  createdAt: Date | string | null | undefined,
  graceDays: number,
  now = new Date(),
): boolean {
  const days = Number.isFinite(graceDays) ? Math.max(0, Math.floor(graceDays)) : 0;
  if (days <= 0) return true;
  if (createdAt == null || createdAt === '') return true;
  const start = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(start.getTime())) return true;
  return now.getTime() >= start.getTime() + days * MS_PER_DAY;
}

export function documentsGraceEndsAt(
  createdAt: Date | string | null | undefined,
  graceDays: number,
): string | null {
  const days = Number.isFinite(graceDays) ? Math.max(0, Math.floor(graceDays)) : 0;
  if (days <= 0 || createdAt == null || createdAt === '') return null;
  const start = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + days * MS_PER_DAY).toISOString();
}

export function resolveJobsGateTypes(
  kind: KycPartnerKind,
  ops?: DocumentsOpsConfig | null,
): string[] {
  const custom =
    kind === 'DRIVER'
      ? normalizeDocumentTypeList(ops?.requiredDriverDocuments)
      : kind === 'RESTAURANT'
        ? normalizeDocumentTypeList(ops?.requiredRestaurantDocuments)
        : kind === 'RENTAL_COMPANY'
          ? normalizeDocumentTypeList(ops?.requiredRentalCompanyDocuments)
          : normalizeDocumentTypeList(ops?.requiredRentalIndividualDocuments);
  if (custom.length > 0) return custom;
  if (ops?.requireDocumentsForJobs !== true) return [];
  if (kind === 'DRIVER') return [];
  if (kind === 'RESTAURANT') return [...JOBS_GATE_RESTAURANT_KYC_TYPES];
  if (kind === 'RENTAL_COMPANY') return [...JOBS_GATE_RENTAL_COMPANY_KYC_TYPES];
  return [...JOBS_GATE_RENTAL_INDIVIDUAL_KYC_TYPES];
}

export type DocumentsReminder = {
  active: boolean;
  blocked: boolean;
  gracePeriodDays: number;
  graceEndsAt: string | null;
  daysRemaining: number | null;
  hoursRemaining: number | null;
  missingTypes: string[];
  missingLabels: string[];
  message: string;
};

export function buildDocumentsReminder(params: {
  requireDocumentsForJobs: boolean;
  gracePeriodDays: number;
  createdAt?: Date | string | null;
  missingTypes: string[];
  now?: Date;
}): DocumentsReminder {
  const now = params.now ?? new Date();
  const gracePeriodDays = Math.max(0, Math.floor(params.gracePeriodDays || 0));
  const missingTypes = normalizeDocumentTypeList(params.missingTypes);
  const missingLabels = missingTypes.map((t) => kycDocumentLabel(t));
  const active = params.requireDocumentsForJobs && missingTypes.length > 0;
  const graceEndsAt = documentsGraceEndsAt(params.createdAt, gracePeriodDays);
  let daysRemaining: number | null = null;
  let hoursRemaining: number | null = null;
  if (graceEndsAt) {
    const msLeft = new Date(graceEndsAt).getTime() - now.getTime();
    if (msLeft > 0) {
      daysRemaining = Math.max(0, Math.ceil(msLeft / MS_PER_DAY));
      hoursRemaining = Math.max(1, Math.ceil(msLeft / (60 * 60 * 1000)));
    } else {
      daysRemaining = 0;
      hoursRemaining = 0;
    }
  }
  const blocked =
    active && documentsGraceElapsed(params.createdAt, gracePeriodDays, now);
  let message = '';
  if (active) {
    const list = missingLabels.join(', ');
    if (blocked) {
      message = `Documents obligatoires manquants ou non validés : ${list}. Déposez-les pour recevoir à nouveau les notifications.`;
    } else if (graceEndsAt && hoursRemaining != null && hoursRemaining > 0 && hoursRemaining < 24) {
      message = `Documents obligatoires à déposer (${list}). Il vous reste ${hoursRemaining} heure${hoursRemaining > 1 ? 's' : ''} avant suspension des notifications.`;
    } else if (daysRemaining != null && daysRemaining > 0) {
      message = `Documents obligatoires à déposer (${list}). Il vous reste ${daysRemaining} jour${daysRemaining > 1 ? 's' : ''} avant suspension des notifications.`;
    } else {
      message = `Documents obligatoires à déposer : ${list}.`;
    }
  }
  return {
    active,
    blocked,
    gracePeriodDays,
    graceEndsAt,
    daysRemaining,
    hoursRemaining,
    missingTypes,
    missingLabels,
    message,
  };
}

/** True si tous les types du gate jobs sont déposés et APPROVED. */
export function checklistSatisfiesJobsGate(
  checklist: Array<{ type?: string; uploaded?: boolean; status?: string | null }>,
  gateTypes: readonly string[],
): boolean {
  if (!gateTypes.length) return true;
  const byType = new Map<string, { uploaded?: boolean; status?: string | null }>();
  for (const item of checklist) {
    const type = String(item.type ?? '').trim().toUpperCase();
    if (type && !byType.has(type)) byType.set(type, item);
  }
  return gateTypes.every((type) => {
    const row = byType.get(String(type).toUpperCase());
    if (!row) return false;
    const uploaded = Boolean(row.uploaded ?? row.status);
    return uploaded && String(row.status ?? '').trim().toUpperCase() === 'APPROVED';
  });
}

export function missingJobsGateTypes(
  checklist: Array<{ type?: string; uploaded?: boolean; status?: string | null }>,
  gateTypes: readonly string[],
): string[] {
  if (!gateTypes.length) return [];
  const byType = new Map<string, { uploaded?: boolean; status?: string | null }>();
  for (const item of checklist) {
    const type = String(item.type ?? '').trim().toUpperCase();
    if (type && !byType.has(type)) byType.set(type, item);
  }
  return gateTypes.filter((type) => {
    const row = byType.get(String(type).toUpperCase());
    if (!row) return true;
    const uploaded = Boolean(row.uploaded ?? row.status);
    return !(uploaded && String(row.status ?? '').trim().toUpperCase() === 'APPROVED');
  });
}

export type PartnerKycSubject = 'RESTAURANT' | 'RENTAL_PARTNER';
export type RentalPartnerKind = 'COMPANY' | 'INDIVIDUAL';

/** Type de partenaire pour l'attribution des justificatifs en revue admin. */
export type KycPartnerKind = 'DRIVER' | 'RESTAURANT' | 'RENTAL_COMPANY' | 'RENTAL_INDIVIDUAL';

export const KYC_PARTNER_KIND_LABELS: Record<KycPartnerKind, string> = {
  DRIVER: 'Chauffeur',
  RESTAURANT: 'Restaurant',
  RENTAL_COMPANY: 'Location (entreprise)',
  RENTAL_INDIVIDUAL: 'Location (particulier)',
};

export function kycPartnerKindLabel(kind: KycPartnerKind): string {
  return KYC_PARTNER_KIND_LABELS[kind];
}

export function rentalKycPartnerKind(partnerType?: string | null): KycPartnerKind {
  return partnerType === 'COMPANY' ? 'RENTAL_COMPANY' : 'RENTAL_INDIVIDUAL';
}

/** Libellé français d'un type de document (chauffeur ou partenaire), jamais l'enum brut. */
export function kycDocumentLabel(type?: string | null): string {
  const upper = (type ?? '').trim().toUpperCase();
  if (!upper) return 'Justificatif';
  if (upper in KYC_DOCUMENT_LABELS) return KYC_DOCUMENT_LABELS[upper as KycDocumentType];
  if (upper in PARTNER_KYC_DOCUMENT_LABELS) {
    return PARTNER_KYC_DOCUMENT_LABELS[upper as PartnerKycDocumentType];
  }
  return type ?? 'Justificatif';
}

export function restaurantKycTypes(): Array<{ type: PartnerKycDocumentType; required: boolean; label: string }> {
  return [
    ...REQUIRED_RESTAURANT_KYC_TYPES.map((type) => ({
      type,
      required: true,
      label: PARTNER_KYC_DOCUMENT_LABELS[type],
    })),
    ...OPTIONAL_RESTAURANT_KYC_TYPES.map((type) => ({
      type,
      required: false,
      label: PARTNER_KYC_DOCUMENT_LABELS[type],
    })),
  ];
}

export function rentalKycTypes(kind: RentalPartnerKind): Array<{
  type: string;
  required: boolean;
  label: string;
}> {
  if (kind === 'INDIVIDUAL') {
    return [
      ...REQUIRED_RENTAL_INDIVIDUAL_KYC_TYPES.map((type) => ({
        type,
        required: true,
        label: KYC_DOCUMENT_LABELS[type as KycDocumentType],
      })),
      {
        type: KYC_DOCUMENT_TYPES.ID_PHOTO,
        required: false,
        label: KYC_DOCUMENT_LABELS[KYC_DOCUMENT_TYPES.ID_PHOTO],
      },
      ...OPTIONAL_RENTAL_INDIVIDUAL_KYC_TYPES.map((type) => ({
        type,
        required: false,
        label: PARTNER_KYC_DOCUMENT_LABELS[type],
      })),
    ];
  }
  return [
    ...REQUIRED_RENTAL_COMPANY_KYC_TYPES.map((type) => ({
      type,
      required: true,
      label: PARTNER_KYC_DOCUMENT_LABELS[type],
    })),
    ...OPTIONAL_RENTAL_COMPANY_KYC_TYPES.map((type) => ({
      type,
      required: false,
      label: PARTNER_KYC_DOCUMENT_LABELS[type],
    })),
  ];
}

export function isPartnerKycDocumentType(raw: string): raw is PartnerKycDocumentType {
  return (Object.values(PARTNER_KYC_DOCUMENT_TYPES) as string[]).includes(raw.trim().toUpperCase());
}

export function normalizePartnerKycDocumentType(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (isPartnerKycDocumentType(upper)) return upper;
  if (upper === KYC_DOCUMENT_TYPES.ID_PHOTO) return KYC_DOCUMENT_TYPES.ID_PHOTO;
  throw new Error(`Invalid partner KYC document type: ${raw}`);
}

const KYC_REJECT_NOTES_MIN = 8;

/** Motif de refus par document — obligatoire, visible par le partenaire. */
export function normalizeKycRejectNotes(approved: boolean, notes?: string | null): string | undefined {
  if (approved) return notes?.trim() || undefined;
  const reason = notes?.trim() ?? '';
  if (reason.length < KYC_REJECT_NOTES_MIN) {
    throw new Error('Indiquez le motif du refus (au moins 8 caractères).');
  }
  return reason;
}

export function driverActivationPinNotifyCopy(pin: string): {
  smsText: string;
  emailSubject: string;
  emailText: string;
  emailHtml: string;
} {
  return {
    smsText:
      `SENGA — votre code PIN (activation et connexion) : ${pin}. ` +
      `Valable 72 h pour l'activation chauffeur. Ne le communiquez à personne.`,
    emailSubject: 'Votre accès SENGA — AfriSoft',
    emailText:
      `Bonjour,\n\nAfriSoft a activé votre accès chauffeur SENGA.\n\n` +
      `Numéro à 6 chiffres (activation 72 h et connexion) : ${pin}\n\n` +
      `Saisissez-le dans l'application SENGA Driver. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\n` +
      `— L'équipe SENGA / AfriSoft\nhttps://afri-soft.com`,
    emailHtml:
      `<p>Bonjour,</p>` +
      `<p>AfriSoft a activé votre accès chauffeur SENGA.</p>` +
      `<p>Numéro à 6 chiffres (activation 72 h et connexion) : <strong>${pin}</strong></p>` +
      `<p>Saisissez-le dans l'application SENGA Driver.</p>` +
      `<p>— L'équipe SENGA / AfriSoft<br/><a href="https://afri-soft.com">afri-soft.com</a></p>`,
  };
}

export function kycRejectNotifyCopy(opts: {
  partnerKindLabel: string;
  documentLabel?: string;
  reason: string;
}): { smsText: string; emailSubject: string; emailText: string; emailHtml: string } {
  const who = opts.partnerKindLabel;
  const what = opts.documentLabel
    ? `votre justificatif « ${opts.documentLabel} » (${who})`
    : `votre dossier ${who}`;
  const motif = opts.reason;
  return {
    smsText: `SENGA : ${what} a été refusé. Motif : ${motif}. Déposez un nouveau document dans l'application.`,
    emailSubject: 'SENGA : justificatif refusé',
    emailText:
      `Bonjour,\n\n${what.charAt(0).toUpperCase()}${what.slice(1)} a été refusé.\n\n` +
      `Motif : ${motif}\n\nDéposez un nouveau document dans l'application SENGA.`,
    emailHtml:
      `<p>Bonjour,</p><p>${what.charAt(0).toUpperCase()}${what.slice(1)} a été refusé.</p>` +
      `<p>Motif : ${escapeNotifyHtml(motif)}</p>` +
      `<p>Déposez un nouveau document dans l'application SENGA.</p>`,
  };
}

function escapeNotifyHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LEGACY_TYPE_MAP: Record<string, KycDocumentType> = {
  permis_de_conduire: KYC_DOCUMENT_TYPES.DRIVERS_LICENSE,
  carte_grise: KYC_DOCUMENT_TYPES.VEHICLE_REGISTRATION,
  carte_rose: KYC_DOCUMENT_TYPES.VEHICLE_REGISTRATION,
  photo_identite: KYC_DOCUMENT_TYPES.ID_PHOTO,
  DRIVERS_LICENSE: KYC_DOCUMENT_TYPES.DRIVERS_LICENSE,
};

export function normalizeKycDocumentType(raw: string): KycDocumentType {
  const upper = raw.trim().toUpperCase();
  const values = Object.values(KYC_DOCUMENT_TYPES) as string[];
  if (values.includes(upper)) return upper as KycDocumentType;
  const legacy = LEGACY_TYPE_MAP[raw.trim()] ?? LEGACY_TYPE_MAP[raw.trim().toLowerCase()];
  if (legacy) return legacy;
  throw new Error(`Invalid KYC document type: ${raw}`);
}

export function isValidKycDocumentType(raw: string): boolean {
  try {
    normalizeKycDocumentType(raw);
    return true;
  } catch {
    return false;
  }
}

/** Every required or uploaded justificatif must be individually APPROVED. */
export function allPartnerJustificatifsApproved(
  checklist: Array<{ required?: boolean; uploaded?: boolean; status?: string | null }>,
): boolean {
  const relevant = checklist.filter((item) => item.required || item.uploaded);
  // Aucun justificatif requis ni déposé : dossier approuvable (chauffeur docs optionnels).
  if (!relevant.length) return true;
  return relevant.every((item) => String(item.status ?? '').trim().toUpperCase() === 'APPROVED');
}

export function allDriverJustificatifsApproved(
  items: Array<{ type?: string; required?: boolean; uploaded?: boolean; status?: string | null }>,
): boolean {
  const hasTypedRows = items.some((item) => item.type || item.required !== undefined || item.uploaded !== undefined);
  if (hasTypedRows) {
    const byType = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      const type = String(item.type ?? '').trim().toUpperCase();
      if (type && !byType.has(type)) byType.set(type, item);
    }
    const requiredRows = REQUIRED_DRIVER_KYC_TYPES.map((type) => {
      const found = byType.get(type);
      return {
        required: true,
        uploaded: Boolean(found?.uploaded ?? found?.status),
        status: found?.status ?? null,
      };
    });
    const extraUploaded = items
      .filter((item) => {
        const type = String(item.type ?? '').trim().toUpperCase();
        return !REQUIRED_DRIVER_KYC_TYPES.includes(type as KycDocumentType) && Boolean(item.uploaded || item.status);
      })
      .map((item) => ({ required: false, uploaded: true, status: item.status ?? null }));
    return allPartnerJustificatifsApproved([...requiredRows, ...extraUploaded]);
  }
  if (!items.length) return true;
  return items.every((doc) => String(doc.status ?? '').trim().toUpperCase() === 'APPROVED');
}
