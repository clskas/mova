export type DriverDocumentField = 'license' | 'insurance' | 'technicalInspection';

export type VehicleTypeApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DriverDocumentExpiryInput {
  licenseExpiry?: Date | string | null;
  insuranceExpiry?: Date | string | null;
  technicalInspectionExpiry?: Date | string | null;
  documentsRenewalPending?: boolean;
  vehicleTypeApprovalStatus?: VehicleTypeApprovalStatus | null;
  vehicleTypeApprovalNotes?: string | null;
}

export type DriverDocumentItemStatus = 'ok' | 'missing' | 'expired' | 'expiring_soon';

export interface DriverDocumentItem {
  field: DriverDocumentField;
  label: string;
  expiresAt: string | null;
  daysRemaining: number | null;
  status: DriverDocumentItemStatus;
}

export interface DriverDocumentsStatus {
  valid: boolean;
  canOperate: boolean;
  missing: DriverDocumentField[];
  expired: DriverDocumentField[];
  expiringSoon: DriverDocumentField[];
  items: DriverDocumentItem[];
  soonestExpiry: string | null;
  blockReason?: string;
}

const MS_PER_DAY = 86_400_000;

const DOCUMENT_FIELDS: {
  field: DriverDocumentField;
  label: string;
  key: 'licenseExpiry' | 'insuranceExpiry' | 'technicalInspectionExpiry';
}[] = [
  { field: 'license', label: 'Permis de conduire', key: 'licenseExpiry' },
  { field: 'insurance', label: 'Assurance véhicule', key: 'insuranceExpiry' },
  { field: 'technicalInspection', label: 'Visite technique', key: 'technicalInspectionExpiry' },
];

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseExpiry(value: Date | string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysRemaining(expiry: Date, now: Date): number {
  const exp = startOfDay(expiry);
  const today = startOfDay(now);
  return Math.round((exp.getTime() - today.getTime()) / MS_PER_DAY);
}

export function evaluateDriverDocuments(
  profile: DriverDocumentExpiryInput,
  now = new Date(),
  warnDays = 30,
): DriverDocumentsStatus {
  const missing: DriverDocumentField[] = [];
  const expired: DriverDocumentField[] = [];
  const expiringSoon: DriverDocumentField[] = [];
  const items: DriverDocumentItem[] = [];
  let soonestExpiry: Date | null = null;

  for (const { field, label, key } of DOCUMENT_FIELDS) {
    const parsed = parseExpiry(profile[key]);
    if (!parsed) {
      missing.push(field);
      items.push({ field, label, expiresAt: null, daysRemaining: null, status: 'missing' });
      continue;
    }
    const remaining = daysRemaining(parsed, now);
    if (soonestExpiry == null || parsed < soonestExpiry) soonestExpiry = parsed;
    const expiresAt = parsed.toISOString();
    if (remaining < 0) {
      expired.push(field);
      items.push({ field, label, expiresAt, daysRemaining: remaining, status: 'expired' });
    } else if (remaining <= warnDays) {
      expiringSoon.push(field);
      items.push({ field, label, expiresAt, daysRemaining: remaining, status: 'expiring_soon' });
    } else {
      items.push({ field, label, expiresAt, daysRemaining: remaining, status: 'ok' });
    }
  }

  const valid = missing.length === 0 && expired.length === 0;
  let canOperate = valid && !profile.documentsRenewalPending;

  let blockReason: string | undefined;
  if (!canOperate) {
    if (profile.documentsRenewalPending) {
      blockReason =
        'Renouvellement de documents en attente de validation MOVA. Téléversez les nouveaux justificatifs si ce n\'est pas déjà fait.';
    } else if (expired.length > 0) {
      const labels = items.filter((i) => i.status === 'expired').map((i) => i.label);
      blockReason = `Document(s) expiré(s) : ${labels.join(', ')}. Mettez à jour vos dates dans l'enregistrement.`;
    } else if (missing.length > 0) {
      const labels = items.filter((i) => i.status === 'missing').map((i) => i.label);
      blockReason = `Date(s) d'expiration manquante(s) : ${labels.join(', ')}.`;
    }
  }

  const vtStatus = profile.vehicleTypeApprovalStatus;
  if (canOperate && vtStatus && vtStatus !== 'APPROVED') {
    canOperate = false;
    if (vtStatus === 'REJECTED') {
      blockReason = profile.vehicleTypeApprovalNotes?.trim()
        ? `Type d'engin refusé : ${profile.vehicleTypeApprovalNotes.trim()}`
        : "Type d'engin refusé par MOVA. Modifiez le type déclaré ou la photo de l'engin dans Enregistrement.";
    } else {
      blockReason =
        "Type d'engin en attente de validation MOVA (vérifiez la photo et la catégorie déclarée : Moto-taxi, Standard, Confort ou VIP).";
    }
  }

  return {
    valid,
    canOperate,
    missing,
    expired,
    expiringSoon,
    items,
    soonestExpiry: soonestExpiry?.toISOString() ?? null,
    blockReason,
  };
}

export function formatRentalRemaining(endDate: Date | string, now = new Date()): {
  remainingMs: number;
  remainingDays: number;
  remainingHours: number;
  remainingLabel: string;
  isActive: boolean;
} {
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  const remainingMs = Math.max(0, end.getTime() - now.getTime());
  const remainingDays = Math.ceil(remainingMs / MS_PER_DAY);
  const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  const isActive = remainingMs > 0;

  let remainingLabel: string;
  if (remainingMs <= 0) {
    remainingLabel = 'Location terminée';
  } else if (remainingDays >= 2) {
    remainingLabel = `${remainingDays} jour${remainingDays > 1 ? 's' : ''} restant${remainingDays > 1 ? 's' : ''}`;
  } else if (remainingHours >= 2) {
    remainingLabel = `${remainingHours} heure${remainingHours > 1 ? 's' : ''} restante${remainingHours > 1 ? 's' : ''}`;
  } else {
    const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    remainingLabel = `${minutes} minute${minutes > 1 ? 's' : ''} restante${minutes > 1 ? 's' : ''}`;
  }

  return { remainingMs, remainingDays, remainingHours, remainingLabel, isActive };
}
