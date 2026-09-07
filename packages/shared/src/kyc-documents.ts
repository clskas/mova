/** Types de documents KYC chauffeur — alignés sur le parcours d'enregistrement SENGA. */
export const KYC_DOCUMENT_TYPES = {
  ID_PHOTO: 'ID_PHOTO',
  SELFIE: 'SELFIE',
  DRIVERS_LICENSE: 'DRIVERS_LICENSE',
  VEHICLE_REGISTRATION: 'VEHICLE_REGISTRATION',
  VEHICLE_INSURANCE: 'VEHICLE_INSURANCE',
  TECHNICAL_INSPECTION: 'TECHNICAL_INSPECTION',
  CRIMINAL_RECORD: 'CRIMINAL_RECORD',
} as const;

export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[keyof typeof KYC_DOCUMENT_TYPES];

export const KYC_DOCUMENT_LABELS: Record<KycDocumentType, string> = {
  ID_PHOTO: 'Carte d\'identité / passeport',
  SELFIE: 'Photo récente (profil)',
  DRIVERS_LICENSE: 'Permis de conduire',
  VEHICLE_REGISTRATION: 'Carte grise',
  VEHICLE_INSURANCE: 'Assurance véhicule',
  TECHNICAL_INSPECTION: 'Visite technique',
  CRIMINAL_RECORD: 'Extrait casier judiciaire',
};

/** Documents obligatoires avant validation admin. */
export const REQUIRED_DRIVER_KYC_TYPES: KycDocumentType[] = [
  KYC_DOCUMENT_TYPES.ID_PHOTO,
  KYC_DOCUMENT_TYPES.SELFIE,
  KYC_DOCUMENT_TYPES.DRIVERS_LICENSE,
  KYC_DOCUMENT_TYPES.VEHICLE_REGISTRATION,
  KYC_DOCUMENT_TYPES.VEHICLE_INSURANCE,
  KYC_DOCUMENT_TYPES.TECHNICAL_INSPECTION,
];

export const OPTIONAL_DRIVER_KYC_TYPES: KycDocumentType[] = [KYC_DOCUMENT_TYPES.CRIMINAL_RECORD];

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

export const REQUIRED_RESTAURANT_KYC_TYPES: PartnerKycDocumentType[] = [
  PARTNER_KYC_DOCUMENT_TYPES.MANAGER_ID,
  PARTNER_KYC_DOCUMENT_TYPES.RCCM,
  PARTNER_KYC_DOCUMENT_TYPES.PREMISES_PHOTO,
];

export const OPTIONAL_RESTAURANT_KYC_TYPES: PartnerKycDocumentType[] = [
  PARTNER_KYC_DOCUMENT_TYPES.NIF,
  PARTNER_KYC_DOCUMENT_TYPES.PAYOUT_PROOF,
];

export const REQUIRED_RENTAL_COMPANY_KYC_TYPES: PartnerKycDocumentType[] = [
  PARTNER_KYC_DOCUMENT_TYPES.RCCM,
  PARTNER_KYC_DOCUMENT_TYPES.COMPANY_STATUTES,
  PARTNER_KYC_DOCUMENT_TYPES.MANAGER_ID,
  PARTNER_KYC_DOCUMENT_TYPES.HEADQUARTERS_PROOF,
];

export const OPTIONAL_RENTAL_COMPANY_KYC_TYPES: PartnerKycDocumentType[] = [
  PARTNER_KYC_DOCUMENT_TYPES.NIF,
];

export const REQUIRED_RENTAL_INDIVIDUAL_KYC_TYPES: KycDocumentType[] = [KYC_DOCUMENT_TYPES.ID_PHOTO];

export const OPTIONAL_RENTAL_INDIVIDUAL_KYC_TYPES: PartnerKycDocumentType[] = [
  PARTNER_KYC_DOCUMENT_TYPES.ADDRESS_PROOF,
];

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
        label: KYC_DOCUMENT_LABELS[type],
      })),
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
    emailSubject: 'Votre code PIN SENGA',
    emailText:
      `Votre code PIN SENGA (activation chauffeur et connexion) est ${pin}. ` +
      `L'activation est valable 72 heures. Saisissez-le dans l'application.\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
    emailHtml:
      `<p>Votre code PIN SENGA (activation chauffeur et connexion) est <strong>${pin}</strong>.</p>` +
      `<p>L'activation est valable 72 heures. Saisissez-le dans l'application.</p>`,
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
