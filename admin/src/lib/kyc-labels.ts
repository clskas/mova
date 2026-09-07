export const KYC_DOC_LABELS: Record<string, string> = {
  ID_PHOTO: "Carte d'identité / passeport",
  SELFIE: "Photo récente (profil)",
  DRIVERS_LICENSE: "Permis de conduire",
  VEHICLE_REGISTRATION: "Carte grise",
  VEHICLE_INSURANCE: "Assurance véhicule",
  TECHNICAL_INSPECTION: "Visite technique",
  CRIMINAL_RECORD: "Extrait casier judiciaire",
  MANAGER_ID: "Identité du gérant (carte d'électeur / passeport)",
  RCCM: "RCCM ou preuve d'activité",
  NIF: "NIF (si disponible)",
  PREMISES_PHOTO: "Adresse / photos du local",
  PAYOUT_PROOF: "Preuve des coordonnées de paiement",
  COMPANY_STATUTES: "Statuts ou agrément",
  HEADQUARTERS_PROOF: "Preuve de siège",
  ADDRESS_PROOF: "Preuve d'adresse",
};

export const VEHICLE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "MOTO_TAXI", label: "Moto-taxi" },
  { value: "STANDARD", label: "Standard" },
  { value: "COMFORT", label: "Confort" },
  { value: "VIP", label: "VIP" },
  { value: "UTILITAIRE", label: "Utilitaire" },
  { value: "CAMION", label: "Camion" },
];

export const VEHICLE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  VEHICLE_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export function kycDocLabel(type?: string | null, typeLabel?: string | null): string {
  if (typeLabel && type && typeLabel !== type && !/^[A-Z0-9_]+$/.test(typeLabel)) return typeLabel;
  const upper = (type ?? "").trim().toUpperCase();
  if (upper && KYC_DOC_LABELS[upper]) return KYC_DOC_LABELS[upper];
  if (typeLabel && !/^[A-Z0-9_]+$/.test(typeLabel)) return typeLabel;
  return typeLabel || type || "Justificatif";
}

export function personDisplayName(parts: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  publicId?: string | null;
  fallback?: string;
}): string {
  const full = [parts.firstName, parts.lastName].filter(Boolean).join(" ").trim();
  return (
    parts.displayName?.trim() ||
    full ||
    parts.phone?.trim() ||
    parts.publicId?.trim() ||
    parts.fallback ||
    "Sans nom"
  );
}
