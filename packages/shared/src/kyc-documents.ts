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
