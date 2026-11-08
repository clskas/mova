"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  activationPinSmsCopy,
  apiFetch,
  fetchDriverDetail,
  fetchDriverScore,
  fetchDrivers,
  MOVA_CITIES,
  purgeDriverProfile,
  regenerateDriverActivationPin,
  reviewDriverKyc,
  reviewDriverDocumentsRenewal,
  reviewVehicleTypeApproval,
  setDriverVehicleCargoVolume,
  setDriverVehicleSeats,
  runKycOcr,
  setDriverOperatingCity,
  setDriverStatus,
  setDriverServiceMode,
  type AdminDriver,
  type AdminDriverDetail,
  type DriverServiceMode,
} from "@/lib/api";
import { downloadCsv } from "@/lib/export-csv";
import { useAdmin } from "@/components/AdminProvider";
import { VehiclePhotoCheckCard } from "@/components/VehiclePhotoCheckCard";
import { SmileIdCard } from "@/components/SmileIdCard";
import { AuthenticatedMedia, resolveMediaUrl } from "@/components/AuthenticatedMedia";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { kycDocLabel, VEHICLE_TYPE_LABELS, VEHICLE_TYPE_OPTIONS } from "@/lib/kyc-labels";

/** Mirrors @mova/shared passenger-seats: default when the driver declared nothing. */
const DEFAULT_PASSENGER_SEATS: Record<string, number> = {
  MOTO_TAXI: 1,
  STANDARD: 4,
  COMFORT: 4,
  VIP: 4,
  FAMILIALE: 6,
  UTILITAIRE: 2,
  CAMION: 2,
  TRICYCLE: 3,
  TRIPOTEUR: 1,
};
const CARGO_VOLUME_RANGE: Record<string, { min: number; max: number }> = {
  UTILITAIRE: { min: 1, max: 25 },
  CAMION: { min: 5, max: 100 },
  TRIPOTEUR: { min: 1, max: 4 },
};
function vehicleCargoLabel(v: { type: string; cargoVolumeM3?: number | null }): string | null {
  if (!CARGO_VOLUME_RANGE[v.type]) return null;
  return v.cargoVolumeM3 != null ? `${v.cargoVolumeM3} m³ utiles` : "volume utile non déclaré";
}
function vehicleSeatsLabel(v: { type: string; passengerSeats?: number | null }): string {
  if (v.passengerSeats != null) return `${v.passengerSeats} place${v.passengerSeats > 1 ? "s" : ""} passagers`;
  const d = DEFAULT_PASSENGER_SEATS[v.type] ?? 4;
  return `${d} place${d > 1 ? "s" : ""} passagers (par défaut)`;
}
import {
  createdAtInRange,
  rangeForPresetDays,
  todayYmdKinshasa,
  type PeriodMode,
  type PeriodPresetDays,
} from "@/lib/period-filter";
import {
  BtnDanger,
  BtnGhost,
  BtnSuccess,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  SelectInput,
  StatusBadge,
} from "@/components/ui";

const RENEWAL_DOC_TYPES = ["DRIVERS_LICENSE", "VEHICLE_INSURANCE", "TECHNICAL_INSPECTION"] as const;

function activeDriverVehicle(driver?: AdminDriver | AdminDriverDetail | null) {
  if (!driver?.vehicles?.length) return null;
  return driver.vehicles.find((v) => v.isActive !== false) ?? driver.vehicles[0];
}

function allJustificatifsApproved(
  items?: Array<{ required?: boolean; uploaded?: boolean; status?: string | null }>,
): boolean {
  const list = items ?? [];
  const relevant = list.filter((item) => item.required || item.uploaded);
  return relevant.length > 0 && relevant.every((item) => String(item.status ?? "").toUpperCase() === "APPROVED");
}

function vehicleTypeApprovalLabel(status?: string | null): string {
  switch (status) {
    case "APPROVED":
      return "Type validé";
    case "REJECTED":
      return "Type refusé";
    case "PENDING":
    default:
      return "Type en attente";
  }
}

function vehicleTypeApprovalClass(status?: string | null): string {
  switch (status) {
    case "APPROVED":
      return "text-green-800 bg-green-50 border-green-200";
    case "REJECTED":
      return "text-red-800 bg-red-50 border-red-200";
    default:
      return "text-amber-900 bg-amber-50 border-amber-200";
  }
}

type KycOcrInfo = NonNullable<NonNullable<AdminDriverDetail["kyc"]>["checklist"]>[number]["ocr"];

function ocrStatusLabel(status?: string | null): string {
  switch (status) {
    case "MATCH":
      return "OCR conforme";
    case "MISMATCH":
      return "OCR — écart détecté";
    case "UNREADABLE":
      return "OCR illisible";
    case "SKIPPED":
      return "OCR désactivé";
    case "PROCESSING":
      return "OCR en cours…";
    default:
      return "OCR en attente";
  }
}

function ocrStatusClass(status?: string | null): string {
  switch (status) {
    case "MATCH":
      return "text-green-700 bg-green-50 border-green-200";
    case "MISMATCH":
      return "text-red-700 bg-red-50 border-red-200";
    case "UNREADABLE":
      return "text-amber-800 bg-amber-50 border-amber-200";
    case "SKIPPED":
      return "text-gray-600 bg-gray-50 border-gray-200";
    case "PROCESSING":
      return "text-blue-700 bg-blue-50 border-blue-200";
    default:
      return "text-gray-500 bg-gray-50 border-gray-200";
  }
}

const OCR_PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude",
  documentai: "Google Document AI",
  openai: "OpenAI",
};

const EXTRACTED_FIELD_LABELS: Record<string, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  idNumber: "N° pièce",
  birthDate: "Naissance",
  licenseNumber: "N° permis",
  expiryDate: "Expiration",
  categories: "Catégories",
  plateNumber: "Plaque",
  make: "Marque",
  model: "Modèle",
  color: "Couleur",
};

function normalizeName(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/** Name read on the ID differs from the name read on the driving licence. */
function kycNameMismatch(checklist?: { type: string; ocr?: KycOcrInfo }[] | null): string | null {
  const id = checklist?.find((i) => i.type === "ID_PHOTO")?.ocr?.extractedFields;
  const lic = checklist?.find((i) => i.type === "DRIVERS_LICENSE")?.ocr?.extractedFields;
  if (!id?.lastName || !lic?.lastName) return null;
  if (normalizeName(id.lastName) === normalizeName(lic.lastName)) return null;
  return `Nom lu sur la pièce d'identité (${id.lastName}) différent du nom lu sur le permis (${lic.lastName}).`;
}

/** AI forgery-signs verdict on one document (a hint for the admin, never a proof). */
function ForgeryBadge({ ocr }: { ocr?: KycOcrInfo | null }) {
  const f = ocr?.forgeryCheck;
  if (!f?.verdict) return null;
  const style =
    f.verdict === "SUSPECT"
      ? "border-red-300 bg-red-50 text-red-900"
      : f.verdict === "A_VERIFIER"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-green-200 bg-green-50 text-green-900";
  const title =
    f.verdict === "SUSPECT"
      ? "⚠ Falsification possible — vérifiez l'original"
      : f.verdict === "A_VERIFIER"
        ? "À vérifier de près"
        : "Aucun signe de falsification vu";
  const details = [
    f.isExpectedDocument === false ? "Ce n'est pas le document attendu." : null,
    f.photoOfScreen ? "Photo d'un écran." : null,
    f.photocopyOrPrint ? "Photocopie ou impression." : null,
    ...(f.signs ?? []),
  ].filter(Boolean) as string[];
  return (
    <div className={`mt-2 rounded-lg border px-3 py-2 text-xs space-y-1 ${style}`} data-testid="forgery-badge">
      <p className="font-medium">Contrôle anti-falsification (IA) : {title}</p>
      {details.length > 0 && (
        <ul className="list-disc pl-4">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {f.notes && <p>{f.notes}</p>}
      <p className="opacity-70">Indication seulement : l&apos;IA ne peut pas prouver qu&apos;un document est authentique.</p>
    </div>
  );
}

function formatOcrDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR");
}

function OcrBadge({ ocr }: { ocr?: KycOcrInfo | null }) {
  if (!ocr) return null;
  const extracted = formatOcrDate(ocr.extractedExpiry);
  const profile = formatOcrDate(ocr.profileExpiry);
  return (
    <div className={`mt-2 rounded-lg border px-3 py-2 text-xs space-y-1 ${ocrStatusClass(ocr.status)}`}>
      <p className="font-medium">{ocrStatusLabel(ocr.status)}</p>
      {extracted && <p>Date détectée : {extracted}</p>}
      {profile && <p>Date profil : {profile}</p>}
      {ocr.confidence != null && <p>Confiance : {Math.round(ocr.confidence * 100)} %</p>}
      {ocr.notes && <p>{ocr.notes}</p>}
      {ocr.extractedFields && Object.keys(ocr.extractedFields).length > 0 && (
        <p>
          <span className="opacity-70">Lu automatiquement : </span>
          {Object.entries(ocr.extractedFields)
            .map(([k, v]) => `${EXTRACTED_FIELD_LABELS[k] ?? k} ${k.endsWith("Date") ? formatOcrDate(v) ?? v : v}`)
            .join(" · ")}
        </p>
      )}
      {(ocr.providers?.length ?? 0) > 1 && (
        <table className="w-full mt-1 border-t border-current/20 text-[11px]">
          <thead>
            <tr className="text-left opacity-70">
              <th className="py-1 pr-2 font-normal">Moteur</th>
              <th className="py-1 pr-2 font-normal">Date lue</th>
              <th className="py-1 pr-2 font-normal">Confiance</th>
              <th className="py-1 font-normal">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {ocr.providers!.map((p) => (
              <tr key={p.provider} className="align-top">
                <td className="py-0.5 pr-2 font-medium">{OCR_PROVIDER_LABELS[p.provider] ?? p.provider}</td>
                <td className="py-0.5 pr-2">{formatOcrDate(p.extractedExpiry) ?? "—"}</td>
                <td className="py-0.5 pr-2">{p.confidence != null ? `${Math.round(p.confidence * 100)} %` : "—"}</td>
                <td className="py-0.5" title={p.error ?? p.notes ?? ""}>
                  {p.error ? "Erreur" : ocrStatusLabel(p.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(ocr.providers?.length ?? 0) > 1 &&
        new Set(ocr.providers!.map((p) => p.extractedExpiry?.slice(0, 10) ?? "")).size > 1 && (
          <p className="font-medium">⚠ Les moteurs ne lisent pas la même date : vérifiez le document à l&apos;œil.</p>
        )}
      {ocr.checkedAt && (
        <p className="opacity-70">Analysé le {new Date(ocr.checkedAt).toLocaleString("fr-FR")}</p>
      )}
    </div>
  );
}

function resolveServiceMode(d: AdminDriver | AdminDriverDetail): DriverServiceMode {
  if (d.serviceMode === "BOTH" || d.serviceMode === "RIDES_ONLY" || d.serviceMode === "DELIVERIES_ONLY") {
    return d.serviceMode;
  }
  if (d.acceptsRides === false) return "DELIVERIES_ONLY";
  if (d.acceptsDeliveries === false) return "RIDES_ONLY";
  return "BOTH";
}

function driverServiceRoleLabel(d: AdminDriver | AdminDriverDetail): string {
  const mode = resolveServiceMode(d);
  if (mode === "RIDES_ONLY") return "Courses uniquement";
  if (mode === "DELIVERIES_ONLY") return "Livraisons uniquement";
  return "Courses + livraisons";
}

function serviceModeBadgeClass(mode: DriverServiceMode): string {
  if (mode === "RIDES_ONLY") return "border-gray-200 bg-gray-50 text-gray-700";
  if (mode === "DELIVERIES_ONLY") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-violet-200 bg-violet-50 text-violet-800";
}

function driverStageLabel(d: AdminDriver | AdminDriverDetail): string {
  const vehicle = activeDriverVehicle(d);
  if (vehicle?.typeApprovalStatus === "REJECTED") return "Type engin refusé";
  if (vehicle?.typeApprovalStatus === "PENDING" && d.onboardingCompleted) return "Type engin — à valider";
  if (d.documentsRenewalPending) return "Renouvellement docs — à valider";
  if (d.kycStatus === "APPROVED") {
    if (d.activationPinVerified) return "Actif (PIN OK)";
    return "KYC OK — PIN à transmettre";
  }
  if (d.readyForReview || (d.onboardingCompleted && d.kycStatus === "PENDING")) {
    return "Dossier soumis — à valider";
  }
  if (d.onboardingCompleted) return "Dossier soumis";
  if ((d.kycDocumentsUploaded ?? 0) > 0) return "Enregistrement en cours";
  return "Nouveau — enregistrement";
}

export default function ChauffeursPage() {
  const { canWrite, role, user } = useAdmin();
  const readOnly = !canWrite("chauffeurs");
  const canReviewKyc = canWrite("kyc");
  const canSetVehicleType = role === "SUPER_ADMIN" || role === "ADMIN" || role === "CITY_ADMIN";
  const canEditOperatingCity = role === "SUPER_ADMIN" || role === "ADMIN";
  const canFilterCity = role === "SUPER_ADMIN" || role === "ADMIN";
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [cityFilter, setCityFilter] = useState("");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("preset");
  const [period, setPeriod] = useState<PeriodPresetDays>(30);
  const [customFrom, setCustomFrom] = useState(() => rangeForPresetDays(30).from);
  const [customTo, setCustomTo] = useState(todayYmdKinshasa);
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null);
  const [appliedTo, setAppliedTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminDriverDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ driver: AdminDriver; activate: boolean } | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | "both" | "ride_only" | "delivery_only">("all");
  const [saving, setSaving] = useState(false);
  const [activationPin, setActivationPin] = useState<string | null>(null);
  const [smsNotice, setSmsNotice] = useState<string | null>(null);
  const [vehicleTypeRejectNotes, setVehicleTypeRejectNotes] = useState("");
  const [seatsInput, setSeatsInput] = useState("");
  const [cargoInput, setCargoInput] = useState("");
  const [selectedVehicleType, setSelectedVehicleType] = useState("");
  const [editOperatingCity, setEditOperatingCity] = useState("");
  const [driverScore, setDriverScore] = useState<{ score: number; band: string; cancelRate: number } | null>(null);

  const scopedCity =
    role === "CITY_ADMIN" ? (user?.managedCity?.trim() || "") : cityFilter.trim();

  const periodBounds = useMemo(() => {
    if (periodMode === "all") return { from: null as string | null, to: null as string | null };
    if (periodMode === "custom" && appliedFrom && appliedTo) {
      return { from: appliedFrom, to: appliedTo };
    }
    if (periodMode === "preset") return rangeForPresetDays(period);
    return { from: null, to: null };
  }, [periodMode, period, appliedFrom, appliedTo]);

  useEffect(() => {
    const handle = window.setTimeout(() => setCommittedSearch(search.trim()), 400);
    return () => window.clearTimeout(handle);
  }, [search]);

  const serverSearch = committedSearch.length >= 2 ? committedSearch : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDrivers(includeHidden, {
        take: serverSearch ? 200 : 500,
        city: scopedCity || null,
        q: serverSearch || null,
      });
      setDrivers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [includeHidden, scopedCity, serverSearch]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setActivationPin(null);
      setSmsNotice(null);
      setEditOperatingCity("");
      setDriverScore(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    Promise.all([
      fetchDriverDetail(selectedId),
      fetchDriverScore(selectedId).catch(() => null),
    ])
      .then(([d, score]) => {
        if (!cancelled) {
          setDetail(d);
          setEditOperatingCity(d.operatingCity?.trim() || "");
          const vehicle = activeDriverVehicle(d);
          setSelectedVehicleType(vehicle?.type ?? "");
          setVehicleTypeRejectNotes("");
          if (d.activationPin) setActivationPin(d.activationPin);
          else setActivationPin(null);
          setDriverScore(score ? { score: score.score, band: score.band, cancelRate: score.cancelRate } : null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur détail chauffeur");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedId]);

  // ?focus=<userId> (links from Fraude / Litiges): open that driver directly.
  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (focus) setSelectedId(focus);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter((d) => {
      const mode = resolveServiceMode(d);
      if (roleFilter === "both" && mode !== "BOTH") return false;
      if (roleFilter === "ride_only" && mode !== "RIDES_ONLY") return false;
      if (roleFilter === "delivery_only" && mode !== "DELIVERIES_ONLY") return false;
      // A name / phone search looks through every driver, not only the last 30 days.
      if (q.length < 2 && !createdAtInRange(d.createdAt, periodBounds.from, periodBounds.to)) return false;
      if (!q) return true;
      const tokens = q.split(/\s+/).filter(Boolean);
      const hay = [
        d.userId,
        d.publicId,
        d.kycStatus,
        d.phone,
        d.operatingCity,
        d.firstName,
        d.lastName,
        ...(d.vehicles?.map((v) => v.plateNumber) ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return tokens.every((token) => hay.includes(token));
    });
  }, [drivers, search, roleFilter, periodBounds]);

  const filterSummaryHint = useMemo(() => {
    const parts: string[] = [];
    if (scopedCity) parts.push(scopedCity);
    else parts.push("toutes villes");
    if (roleFilter === "both") parts.push("courses + livraisons");
    else if (roleFilter === "ride_only") parts.push("courses uniquement");
    else if (roleFilter === "delivery_only") parts.push("livraisons uniquement");
    if (search.trim().length >= 2) {
      parts.push("toutes périodes");
      parts.push(`recherche « ${search.trim()} »`);
    } else if (periodMode === "preset") {
      parts.push(period === 1 ? "aujourd'hui" : `${period}j`);
    } else if (periodMode === "custom" && appliedFrom && appliedTo) {
      parts.push(`${appliedFrom} → ${appliedTo}`);
    } else {
      parts.push("toutes périodes");
    }
    if (drivers.length > 0 && filtered.length !== drivers.length) {
      parts.push(`sur ${drivers.length} chargés`);
    }
    return parts.join(" · ");
  }, [
    scopedCity,
    roleFilter,
    periodMode,
    period,
    appliedFrom,
    appliedTo,
    search,
    drivers.length,
    filtered.length,
  ]);

  async function saveOperatingCity() {
    if (!selectedId || !editOperatingCity.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await setDriverOperatingCity(selectedId, editOperatingCity.trim());
      const refreshed =
        updated && typeof updated === "object" && "operatingCity" in updated
          ? (updated as AdminDriverDetail)
          : await fetchDriverDetail(selectedId);
      setDetail(refreshed);
      setEditOperatingCity(refreshed.operatingCity?.trim() || editOperatingCity.trim());
      setDrivers((prev) =>
        prev.map((d) =>
          d.userId === selectedId ? { ...d, operatingCity: refreshed.operatingCity ?? editOperatingCity.trim() } : d,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de modifier la ville d'opération");
    } finally {
      setSaving(false);
    }
  }

  async function setServiceMode(serviceMode: DriverServiceMode) {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    // Optimistic UI so the chosen mode is visible immediately.
    const optimistic =
      serviceMode === "RIDES_ONLY"
        ? { serviceMode, acceptsRides: true, acceptsDeliveries: false }
        : serviceMode === "DELIVERIES_ONLY"
          ? { serviceMode, acceptsRides: false, acceptsDeliveries: true }
          : { serviceMode: "BOTH" as const, acceptsRides: true, acceptsDeliveries: true };
    setDetail((prev) => (prev ? { ...prev, ...optimistic } : prev));
    setDrivers((prev) =>
      prev.map((d) => (d.userId === selectedId ? { ...d, ...optimistic } : d)),
    );
    try {
      const updated = await setDriverServiceMode(selectedId, serviceMode);
      const refreshed =
        updated && typeof updated === "object" && "serviceMode" in updated
          ? (updated as AdminDriverDetail)
          : await fetchDriverDetail(selectedId);
      setDetail(refreshed);
      setDrivers((prev) =>
        prev.map((d) =>
          d.userId === selectedId
            ? {
                ...d,
                serviceMode: refreshed.serviceMode ?? serviceMode,
                acceptsRides: refreshed.acceptsRides,
                acceptsDeliveries: refreshed.acceptsDeliveries,
              }
            : d,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de changer le mode service");
      try {
        const rolled = await fetchDriverDetail(selectedId);
        setDetail(rolled);
      } catch {
        /* keep optimistic until reload */
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!actionTarget) return;
    setSaving(true);
    try {
      await setDriverStatus(actionTarget.driver.userId, actionTarget.activate, !actionTarget.activate);
      setActionTarget(null);
      setSelectedId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la mise à jour");
    } finally {
      setSaving(false);
    }
  }

  async function reviewKyc(approved: boolean) {
    if (!selectedId) return;
    let notes: string | undefined;
    if (!approved) {
      const motif = window.prompt("Motif du refus (visible par le chauffeur) :");
      if (!motif || motif.trim().length < 8) {
        setError("Indiquez le motif du refus (au moins 8 caractères).");
        return;
      }
      notes = motif.trim();
    }
    setSaving(true);
    setError(null);
    try {
      const result = await reviewDriverKyc(selectedId, approved, notes);
      if (approved && (result.activationPin || result.loginPin)) {
        setActivationPin(result.activationPin ?? result.loginPin ?? null);
        setSmsNotice(activationPinSmsCopy(result));
      } else {
        setActivationPin(null);
        setSmsNotice(activationPinSmsCopy(result) || null);
      }
      load();
      const refreshed = await fetchDriverDetail(selectedId);
      setDetail(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec validation KYC");
    } finally {
      setSaving(false);
    }
  }

  async function reviewDocumentsRenewal(approved: boolean) {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await reviewDriverDocumentsRenewal(selectedId, approved);
      load();
      const refreshed = await fetchDriverDetail(selectedId);
      setDetail(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec validation renouvellement");
    } finally {
      setSaving(false);
    }
  }

  async function reviewVehicleType(approved: boolean) {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const nextType = canSetVehicleType && selectedVehicleType ? selectedVehicleType : undefined;
      await reviewVehicleTypeApproval(
        selectedId,
        approved,
        approved ? undefined : vehicleTypeRejectNotes.trim() || undefined,
        approved ? nextType : undefined,
      );
      if (approved) setVehicleTypeRejectNotes("");
      load();
      const refreshed = await fetchDriverDetail(selectedId);
      setDetail(refreshed);
      const vehicle = activeDriverVehicle(refreshed);
      setSelectedVehicleType(vehicle?.type ?? selectedVehicleType);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec validation type d'engin");
    } finally {
      setSaving(false);
    }
  }

  async function saveVehicleSeats(reset: boolean) {
    if (!selectedId) return;
    const value = reset ? null : Number(seatsInput);
    if (!reset && (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 8)) {
      setError("Nombre de places invalide (1 à 8, moto : 1).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setDriverVehicleSeats(selectedId, value);
      setSeatsInput("");
      const refreshed = await fetchDriverDetail(selectedId);
      setDetail(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement des places");
    } finally {
      setSaving(false);
    }
  }

  async function saveVehicleCargoVolume(reset: boolean, vehicleType: string) {
    if (!selectedId) return;
    const range = CARGO_VOLUME_RANGE[vehicleType];
    const value = reset ? null : Number(cargoInput);
    if (!reset && (!range || !Number.isInteger(value) || (value as number) < range.min || (value as number) > range.max)) {
      setError(range ? `Volume invalide (${range.min} à ${range.max} m³).` : "Volume réservé aux utilitaires et camions.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setDriverVehicleCargoVolume(selectedId, value);
      setCargoInput("");
      const refreshed = await fetchDriverDetail(selectedId);
      setDetail(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement du volume");
    } finally {
      setSaving(false);
    }
  }

  async function triggerKycOcr(documentId: string) {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await runKycOcr(documentId);
      const refreshed = await fetchDriverDetail(selectedId);
      setDetail(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec analyse OCR");
    } finally {
      setSaving(false);
    }
  }

  async function removeGhost() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await purgeDriverProfile(selectedId);
      setSelectedId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de retirer ce profil");
    } finally {
      setSaving(false);
    }
  }

  async function generatePin() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await regenerateDriverActivationPin(selectedId);
      setActivationPin(result.activationPin);
      setSmsNotice(activationPinSmsCopy(result));
      const refreshed = await fetchDriverDetail(selectedId);
      setDetail(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de générer le PIN");
    } finally {
      setSaving(false);
    }
  }

  const selected = (detail ?? drivers.find((d) => d.userId === selectedId) ?? null) as AdminDriverDetail | null;
  const selectedVehicle = activeDriverVehicle(selected);
  const vehicleTypeStatus =
    selectedVehicle?.typeApprovalStatus ?? selected?.vehicleTypeApprovalStatus;

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Chauffeurs"
        subtitle={readOnly ? "Consultation profils chauffeurs" : "Profils véhicule / KYC — distincts des comptes de connexion"}
        action={
          <BtnGhost
            onClick={() =>
              downloadCsv(
                "senga-chauffeurs.csv",
                ["UserId", "PublicId", "Nom", "Tél", "Ville", "KYC", "Disponible"],
                filtered.map((d) => [
                  d.userId,
                  d.publicId ?? "",
                  `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim(),
                  d.phone ?? "",
                  d.operatingCity ?? "",
                  d.kycStatus ?? "",
                  d.isAvailable ? "oui" : "non",
                ]),
              )
            }
            disabled={filtered.length === 0}
          >
            Export CSV
          </BtnGhost>
        }
      />
      <p className="text-sm text-gray-600 mb-4">
        <strong>Chauffeurs</strong> = dossier véhicule et KYC. <strong>Utilisateurs</strong> = comptes de connexion.
        Un chauffeur réel (y compris Google sans +243) apparaît ici <em>et</em> dans Utilisateurs avec le rôle Chauffeur.
        La liste suit la période choisie ; une recherche par nom, téléphone ou plaque ignore la période et parcourt tous les dossiers.
        Seuls les vrais orphelins (sans compte) et Test Lab sont masqués.
      </p>
      <p className="text-sm text-gray-600 mb-4 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2">
        Trois modes service : <strong>courses uniquement</strong> (taxi/moto),{" "}
        <strong>livraisons uniquement</strong> (food/colis), ou <strong>les deux</strong> (défaut SENGA).
        Choisissez le mode dans la fiche chauffeur.
      </p>
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher par ID SENGA, nom, téléphone, plaque ou statut KYC…" />
          <label className="flex flex-col gap-1 text-xs text-gray-600 pb-1">
            Rôle service
            <select
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            >
              <option value="all">Tous</option>
              <option value="both">Courses + livraisons</option>
              <option value="ride_only">Courses uniquement</option>
              <option value="delivery_only">Livraisons uniquement</option>
            </select>
          </label>
          {canFilterCity && (
            <label className="flex flex-col gap-0.5 min-w-[11rem]">
              <span className="text-[11px] font-medium text-gray-500 px-0.5">Ville</span>
              <SelectInput
                value={cityFilter}
                onChange={setCityFilter}
                options={[
                  { value: "", label: "Toutes les villes" },
                  ...MOVA_CITIES.map((c) => ({ value: c, label: c })),
                ]}
              />
            </label>
          )}
          {role === "SUPER_ADMIN" && (
            <label className="flex items-center gap-2 text-sm text-gray-600 pb-1">
              <input
                type="checkbox"
                checked={includeHidden}
                onChange={(e) => setIncludeHidden(e.target.checked)}
              />
              Afficher les profils fantômes / Test Lab
            </label>
          )}
        </div>
        <PeriodFilterBar
          mode={periodMode}
          period={period}
          customFrom={customFrom}
          customTo={customTo}
          appliedFrom={appliedFrom}
          appliedTo={appliedTo}
          label="Période"
          onModeChange={(m) => {
            setPeriodMode(m);
            if (m !== "custom") {
              setAppliedFrom(null);
              setAppliedTo(null);
            }
          }}
          onPeriodChange={setPeriod}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
          onApplyCustom={() => {
            if (!customFrom || !customTo || customFrom > customTo) return;
            setAppliedFrom(customFrom);
            setAppliedTo(customTo);
            setPeriodMode("custom");
          }}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <MetricCard
            label="Chauffeurs filtrés"
            value={loading ? "…" : filtered.length}
            hint={filterSummaryHint}
            accent="green"
          />
        </div>
        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState message="Aucun chauffeur enregistré" />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="p-3">Identifiant</th>
                  <th className="p-3">Compte</th>
                  <th className="p-3">Ville</th>
                  <th className="p-3">Étape</th>
                  <th className="p-3">Rôle</th>
                  <th className="p-3">Docs</th>
                  <th className="p-3">KYC</th>
                  <th className="p-3">État</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{d.publicId ?? d.userId.slice(0, 8)}</td>
                    <td className="p-3 text-xs">
                      {d.orphan || d.hiddenReason === "orphan" ? (
                        <span className="text-amber-800">Sans compte (fantôme)</span>
                      ) : (
                        <>
                          <span className="block font-medium text-gray-800">
                            {[d.firstName, d.lastName].filter(Boolean).join(" ") || d.email || d.phone || "—"}
                          </span>
                          {d.phone && <span className="block text-gray-500">{d.phone}</span>}
                          {!d.phone && d.email && <span className="block text-gray-500">{d.email}</span>}
                          {d.userRole && d.userRole !== "DRIVER" && (
                            <span className="block text-amber-700">Rôle compte : {d.userRole}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="p-3 text-xs">{d.operatingCity?.trim() || "—"}</td>
                    <td className="p-3 text-xs">{driverStageLabel(d)}</td>
                    <td className="p-3 text-xs">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${serviceModeBadgeClass(resolveServiceMode(d))}`}
                      >
                        {driverServiceRoleLabel(d)}
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      {d.kycDocumentsUploaded ?? 0}/{d.kycDocumentsRequired ?? 6}
                      {d.onboardingCompleted && <span className="block text-green-600">Dossier envoyé</span>}
                    </td>
                    <td className="p-3"><StatusBadge status={d.kycStatus} /></td>
                    <td className="p-3 text-xs">
                      {d.dutyStatus === "ON_TRIP"
                        ? "En course"
                        : d.dutyStatus === "AVAILABLE" || d.isAvailable
                          ? "Disponible"
                          : "Hors ligne"}
                    </td>
                    <td className="p-3">
                      <button type="button" onClick={() => setSelectedId(d.userId)} className="text-[#6C63FF] text-sm hover:underline">
                        Détail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Modal open={!!selectedId} onClose={() => setSelectedId(null)} title="Détail chauffeur" wide>
        {detailLoading && !selected ? (
          <LoadingState />
        ) : selected ? (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <p><span className="text-gray-500">Identifiant SENGA:</span> <span className="font-mono font-medium">{selected.publicId ?? "—"}</span></p>
              <p><span className="text-gray-500">Téléphone:</span> {detail?.user?.phone ?? selected.phone ?? "—"}</p>
              <p><span className="text-gray-500">Nom:</span> {[detail?.user?.firstName, detail?.user?.lastName].filter(Boolean).join(" ") || [selected.firstName, selected.lastName].filter(Boolean).join(" ") || "—"}</p>
              <p>
                <span className="text-gray-500">Compte Utilisateurs:</span>{" "}
                {selected.orphan || !detail?.user
                  ? "Aucun — profil fantôme"
                  : selected.userRole === "DRIVER"
                    ? "Chauffeur"
                    : `présent, rôle ${selected.userRole ?? detail.user?.role ?? "?"}`}
              </p>
              <p><span className="text-gray-500">KYC:</span> <StatusBadge status={selected.kycStatus} /></p>
              <p>
                <span className="text-gray-500">Ville d&apos;opération:</span>{" "}
                {(detail?.operatingCity ?? selected.operatingCity)?.trim() || "—"}
              </p>
              <p><span className="text-gray-500">Étape:</span> {driverStageLabel(selected)}</p>
              <p>
                <span className="text-gray-500">Rôle service:</span>{" "}
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${serviceModeBadgeClass(resolveServiceMode(selected))}`}
                >
                  {driverServiceRoleLabel(selected)}
                </span>
              </p>
              <p><span className="text-gray-500">Dossier enregistrement:</span> {selected.onboardingCompleted ? "Soumis ✓" : "En cours"}</p>
              <p><span className="text-gray-500">Documents:</span> {selected.kycDocumentsUploaded ?? 0}/{selected.kycDocumentsRequired ?? 6} obligatoires</p>
              <p><span className="text-gray-500">PIN activé:</span> {selected.activationPinVerified ? "Oui" : "Non"}</p>
              <p><span className="text-gray-500">Note:</span> {selected.ratingAvg?.toFixed(1)} / 5</p>
              {driverScore && (
                <p>
                  <span className="text-gray-500">Score SENGA:</span>{" "}
                  <span className="font-semibold tabular-nums">{driverScore.score}</span>
                  <span className="text-xs text-gray-500"> / 100 · {driverScore.band} · annul. {driverScore.cancelRate}%</span>
                </p>
              )}
              <p><span className="text-gray-500">Courses:</span> {selected.totalRides}</p>
              <p><span className="text-gray-500">Permis:</span> {selected.licenseNumber ?? "—"}</p>
              {detail?.licenseExpiry != null && (
                <p>
                  <span className="text-gray-500">Expiration permis:</span>{" "}
                  {new Date(detail.licenseExpiry).toLocaleDateString("fr-FR")}
                </p>
              )}
              {detail?.insuranceExpiry != null && (
                <p>
                  <span className="text-gray-500">Expiration assurance:</span>{" "}
                  {new Date(detail.insuranceExpiry).toLocaleDateString("fr-FR")}
                </p>
              )}
              {detail?.technicalInspectionExpiry != null && (
                <p>
                  <span className="text-gray-500">Visite technique:</span>{" "}
                  {new Date(detail.technicalInspectionExpiry).toLocaleDateString("fr-FR")}
                </p>
              )}
              {detail?.fiscalStickerExpiry != null && (
                <p>
                  <span className="text-gray-500">Vignette fiscale:</span>{" "}
                  {new Date(detail.fiscalStickerExpiry).toLocaleDateString("fr-FR")}
                </p>
              )}
              {detail?.documentsStatus && (
                <p>
                  <span className="text-gray-500">Documents opérationnels:</span>{" "}
                  {detail.documentsStatus.canOperate ? (
                    <span className="text-green-700">Oui</span>
                  ) : (
                    <span className="text-red-700">
                      Non — {detail.documentsStatus.blockReason ?? "expirés ou incomplets"}
                    </span>
                  )}
                </p>
              )}
              <p><span className="text-gray-500">N° identité:</span> {detail?.idDocumentNumber ?? "—"}</p>
              {(detail?.identityDuplicates?.idDocumentNumber.length ?? 0) +
                (detail?.identityDuplicates?.licenseNumber.length ?? 0) >
                0 && (
                <p className="text-xs rounded-lg border border-red-300 bg-red-50 text-red-900 px-3 py-2">
                  ⚠ Numéro déjà déclaré par un autre chauffeur
                  {(detail?.identityDuplicates?.idDocumentNumber.length ?? 0) > 0 &&
                    ` — pièce d'identité : ${detail!.identityDuplicates!.idDocumentNumber
                      .map((d) => d.publicId ?? d.userId)
                      .join(", ")}`}
                  {(detail?.identityDuplicates?.licenseNumber.length ?? 0) > 0 &&
                    ` — permis : ${detail!.identityDuplicates!.licenseNumber.map((d) => d.publicId ?? d.userId).join(", ")}`}
                  . Même personne avec plusieurs comptes, ou papiers d&apos;une autre personne : vérifiez avant de valider.
                </p>
              )}
              {selectedId && (
                <SmileIdCard userId={selectedId} canWrite={canReviewKyc} phone={detail?.user?.phone ?? null} />
              )}
              {(() => {
                const v = activeDriverVehicle(selected) ?? detail?.vehicle ?? null;
                if (!v) return null;
                return (
                  <>
                    <p>
                      <span className="text-gray-500">Véhicule:</span>{" "}
                      {[v.make, v.model].filter(Boolean).join(" ") || (VEHICLE_TYPE_LABELS[v.type ?? ""] ?? v.type) || "—"}
                      {v.plateNumber ? ` · ${v.plateNumber}` : ""}
                    </p>
                    <p>
                      <span className="text-gray-500">Couleur:</span>{" "}
                      {("color" in v && v.color) ? v.color : "—"}
                    </p>
                  </>
                );
              })()}
              <p><span className="text-gray-500">État:</span>{" "}
                {selected.dutyStatus === "ON_TRIP"
                  ? "En course"
                  : selected.dutyStatus === "AVAILABLE" || selected.isAvailable
                    ? "Disponible"
                    : "Hors ligne"}
              </p>
              {"payoutProvider" in selected && selected.payoutProvider && (
                <p><span className="text-gray-500">Retrait:</span> {selected.payoutProvider} · {selected.payoutPhone ?? "—"}</p>
              )}
            </div>

            {(selected.orphan || selected.hiddenReason === "orphan" || selected.hiddenReason === "leftover") && role === "SUPER_ADMIN" && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm space-y-2">
                <p className="font-semibold text-amber-950">Profil fantôme</p>
                <p className="text-amber-900">
                  Ce dossier n&apos;a pas de compte chauffeur dans Utilisateurs (compte supprimé, Test Lab, ou essai
                  d&apos;app chauffeur). Il ne doit pas apparaître comme un chauffeur réel.
                </p>
                <BtnDanger onClick={removeGhost} disabled={saving}>Retirer ce profil</BtnDanger>
              </div>
            )}

            {activationPin && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm">
                <p className="font-semibold text-amber-900">
                  Code PIN d&apos;activation
                  {selected.activationPinVerified ? " (déjà activé par le chauffeur)" : " — à transmettre au chauffeur"}
                </p>
                <p className="font-mono text-2xl tracking-widest mt-2 text-amber-950">{activationPin}</p>
                {!selected.activationPinVerified && (
                  <p className="text-amber-800 mt-1 text-xs">
                    {smsNotice ??
                      "Le chauffeur saisit ce code dans l'app (72 h, usage unique)."}
                  </p>
                )}
              </div>
            )}

            {"canGenerateActivationPin" in selected && selected.canGenerateActivationPin && !activationPin && canReviewKyc && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm">
                <p className="text-blue-900">KYC approuvé mais aucun PIN actif. Envoyez un code à ce chauffeur (SMS ou e-mail).</p>
                <button
                  type="button"
                  onClick={generatePin}
                  disabled={saving}
                  className="mt-2 px-4 py-2 rounded-lg bg-[#6C63FF] text-white text-sm font-medium disabled:opacity-50"
                >
                  Envoyer le PIN d&apos;activation
                </button>
              </div>
            )}

            {"canGenerateActivationPin" in selected && selected.canGenerateActivationPin && activationPin && canReviewKyc && (
              <button
                type="button"
                onClick={generatePin}
                disabled={saving}
                className="text-sm text-[#6C63FF] hover:underline"
              >
                Renvoyer le PIN
              </button>
            )}

            {selected.activationPinVerified && (
              <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                PIN déjà activé par le chauffeur
                {"activationPinVerifiedAt" in selected && selected.activationPinVerifiedAt
                  ? ` le ${new Date(selected.activationPinVerifiedAt).toLocaleString("fr-FR")}`
                  : ""}
                .
              </p>
            )}

            {selected.readyForReview && selected.kycStatus === "PENDING" && canReviewKyc && (
              <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 text-sm text-violet-900">
                Le chauffeur a terminé et envoyé son dossier ({selected.kycDocumentsUploaded ?? 0}/{selected.kycDocumentsRequired ?? 6} documents).
                Vous pouvez approuver le KYC ci-dessous.
              </div>
            )}

            {"documentsRenewalPending" in selected && selected.documentsRenewalPending && canReviewKyc && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm space-y-3">
                <p className="font-semibold text-amber-950">Renouvellement de documents à vérifier</p>
                <p className="text-amber-900">
                  Le chauffeur a modifié une date d&apos;expiration
                  {selected.documentsRenewalRequestedAt
                    ? ` le ${new Date(selected.documentsRenewalRequestedAt).toLocaleString("fr-FR")}`
                    : ""}
                  . L&apos;OCR compare automatiquement les dates sur les justificatifs avec le profil — validez manuellement après vérification.
                </p>
                <ol className="list-decimal list-inside text-amber-900 space-y-1">
                  <li>Consultez le résultat OCR (date détectée vs date profil).</li>
                  <li>Ouvrez le justificatif si l&apos;OCR signale un écart ou est illisible.</li>
                  <li>Validez uniquement si le document est authentique et non expiré.</li>
                </ol>
                {"kyc" in selected && selected.kyc?.checklist && (
                  <ul className="space-y-2">
                    {selected.kyc.checklist
                      .filter((item) => RENEWAL_DOC_TYPES.includes(item.type as (typeof RENEWAL_DOC_TYPES)[number]))
                      .map((item) => (
                        <li key={item.type} className="flex flex-col gap-2 bg-white/70 rounded-lg px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>{item.label ?? kycDocLabel(item.type) ?? item.type}</span>
                            <div className="flex flex-wrap items-center gap-2">
                              {item.ocr?.documentId && canReviewKyc && (
                                <button
                                  type="button"
                                  onClick={() => triggerKycOcr(item.ocr!.documentId!)}
                                  disabled={saving || item.ocr?.status === "PROCESSING"}
                                  className="text-xs text-[#6C63FF] hover:underline disabled:opacity-50"
                                >
                                  {item.ocr?.status === "PROCESSING" ? "Analyse…" : "Relancer OCR"}
                                </button>
                              )}
                              {item.url ? (
                                <a
                                  href={resolveMediaUrl(item.url) ?? "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#6C63FF] hover:underline text-sm"
                                >
                                  Voir le justificatif
                                </a>
                              ) : (
                                <span className="text-red-700 text-sm">Document manquant</span>
                              )}
                            </div>
                          </div>
                          <OcrBadge ocr={item.ocr} />
                        </li>
                      ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <BtnSuccess onClick={() => reviewDocumentsRenewal(true)} disabled={saving}>
                    Valider le renouvellement
                  </BtnSuccess>
                  <BtnDanger onClick={() => reviewDocumentsRenewal(false)} disabled={saving}>
                    Refuser (chauffeur bloqué)
                  </BtnDanger>
                </div>
              </div>
            )}

            {"kyc" in selected && selected.kyc?.checklist && selected.kyc.checklist.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Documents KYC</p>
                {kycNameMismatch(selected.kyc.checklist) && (
                  <p className="mb-2 text-xs rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2">
                    ⚠ {kycNameMismatch(selected.kyc.checklist)} Vérifiez les documents avant de valider.
                  </p>
                )}
                <ul className="text-sm space-y-1">
                  {selected.kyc.checklist.map((item) => (
                    <li key={item.type} className="bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                      <div className="flex justify-between">
                        <span>{item.label ?? kycDocLabel(item.type)}</span>
                        <span className={item.uploaded ? "text-green-600" : "text-gray-400"}>
                          {item.uploaded ? `✓ ${item.status ?? "uploadé"}` : item.required ? "Manquant" : "Optionnel"}
                        </span>
                      </div>
                      {item.url && (
                        <div className="mt-2 space-y-2">
                          <AuthenticatedMedia
                            url={item.url}
                            alt={item.label ?? item.type}
                            className="max-h-48 w-full object-contain rounded-lg border bg-white"
                          />
                          <a
                            href={resolveMediaUrl(item.url) ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#6C63FF] hover:underline text-xs"
                          >
                            Ouvrir le justificatif
                          </a>
                        </div>
                      )}
                      {item.notes && item.status === "REJECTED" && (
                        <p className="text-xs text-red-700">Motif : {item.notes}</p>
                      )}
                      {canReviewKyc && item.documentId && item.status !== "APPROVED" && item.uploaded && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-xs text-red-700 underline"
                            onClick={async () => {
                              const motif = window.prompt("Motif du refus (visible par le chauffeur) :");
                              if (!motif || motif.trim().length < 8) {
                                setError("Indiquez le motif du refus (au moins 8 caractères).");
                                return;
                              }
                              setSaving(true);
                              try {
                                await apiFetch(`/api/admin/kyc/${item.documentId}/review`, {
                                  method: "POST",
                                  body: JSON.stringify({ approved: false, notes: motif.trim() }),
                                });
                                if (selectedId) setDetail(await fetchDriverDetail(selectedId));
                              } catch (e) {
                                setError(e instanceof Error ? e.message : "Refus impossible");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            Refuser ce justificatif
                          </button>
                        </div>
                      )}
                      {RENEWAL_DOC_TYPES.includes(item.type as (typeof RENEWAL_DOC_TYPES)[number]) && item.uploaded && (
                        <>
                          <OcrBadge ocr={item.ocr} />
                          {item.ocr?.documentId && canReviewKyc && (
                            <button
                              type="button"
                              onClick={() => triggerKycOcr(item.ocr!.documentId!)}
                              disabled={saving || item.ocr?.status === "PROCESSING"}
                              className="text-xs text-[#6C63FF] hover:underline disabled:opacity-50"
                            >
                              {item.ocr?.status === "PROCESSING" ? "Analyse OCR…" : "Analyser OCR"}
                            </button>
                          )}
                        </>
                      )}
                      {item.uploaded && <ForgeryBadge ocr={item.ocr} />}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedVehicle && (
              <div className={`rounded-xl border p-4 text-sm space-y-3 ${vehicleTypeApprovalClass(vehicleTypeStatus)}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold">Validation du type d&apos;engin</p>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-white/60">
                    {vehicleTypeApprovalLabel(vehicleTypeStatus)}
                  </span>
                </div>
                <p>
                  Catégorie déclarée par le chauffeur :{" "}
                  <strong>{VEHICLE_TYPE_LABELS[selectedVehicle.type] ?? selectedVehicle.type}</strong>
                </p>
                <p className="text-xs opacity-90">
                  Comparez la photo de l&apos;engin avec la catégorie (ex. refuser VIP si la photo montre une moto).
                  Vous pouvez corriger le type avant de valider. Le chauffeur ne peut pas passer en ligne tant que le type n&apos;est pas validé.
                </p>
                {(selectedVehicle.photoUrls?.length ? selectedVehicle.photoUrls : [selectedVehicle.imageUrl]).length > 1 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xl">
                    {(selectedVehicle.photoUrls ?? []).map((url, i) => (
                      <AuthenticatedMedia
                        key={url}
                        url={url}
                        alt={`Photo engin ${i + 1}`}
                        className="w-full h-28 object-cover rounded-lg border bg-white"
                        fallback="Photo indisponible"
                      />
                    ))}
                  </div>
                ) : (
                  <AuthenticatedMedia
                    url={selectedVehicle.imageUrl}
                    alt="Photo engin"
                    className="w-full max-w-xs h-36 object-cover rounded-lg border bg-white"
                    fallback="Photo de l'engin non fournie — demandez une mise à jour au chauffeur."
                  />
                )}
                <VehiclePhotoCheckCard
                  key={`${selectedId}-${selectedVehicle.photoCheck?.checkedAt ?? "none"}`}
                  userId={selectedId!}
                  check={selectedVehicle.photoCheck}
                  canRun={canSetVehicleType}
                />
                {canSetVehicleType && (
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">Type d&apos;engin à enregistrer</span>
                    <select
                      value={selectedVehicleType || selectedVehicle.type}
                      onChange={(e) => setSelectedVehicleType(e.target.value)}
                      className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 bg-white"
                    >
                      {VEHICLE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {selectedVehicleType && selectedVehicleType !== selectedVehicle.type && (
                      <span className="block text-xs text-amber-800">
                        Le type déclaré ({VEHICLE_TYPE_LABELS[selectedVehicle.type] ?? selectedVehicle.type}) sera
                        remplacé par {VEHICLE_TYPE_LABELS[selectedVehicleType] ?? selectedVehicleType}.
                      </span>
                    )}
                  </label>
                )}
                <div className="space-y-1">
                  <p className="text-xs">
                    Places passagers : <strong>{vehicleSeatsLabel(selectedVehicle)}</strong>
                  </p>
                  {canSetVehicleType && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={seatsInput}
                        onChange={(e) => setSeatsInput(e.target.value)}
                        placeholder="Places"
                        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-800 bg-white"
                      />
                      <BtnSuccess onClick={() => void saveVehicleSeats(false)} disabled={saving || !seatsInput}>
                        Corriger les places
                      </BtnSuccess>
                      {selectedVehicle.passengerSeats != null && (
                        <BtnDanger onClick={() => void saveVehicleSeats(true)} disabled={saving}>
                          Revenir au défaut
                        </BtnDanger>
                      )}
                    </div>
                  )}
                </div>
                {vehicleCargoLabel(selectedVehicle) && (
                  <div className="space-y-1">
                    <p className="text-xs">
                      Volume utile : <strong>{vehicleCargoLabel(selectedVehicle)}</strong>
                      <span className="text-gray-500">
                        {" "}— vérifiez-le avec la photo et le modèle : seuls les déménagements qui tiennent dans ce
                        volume seront assignables.
                      </span>
                    </p>
                    {canSetVehicleType && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={CARGO_VOLUME_RANGE[selectedVehicle.type]?.min}
                          max={CARGO_VOLUME_RANGE[selectedVehicle.type]?.max}
                          value={cargoInput}
                          onChange={(e) => setCargoInput(e.target.value)}
                          placeholder="m³"
                          className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-800 bg-white"
                        />
                        <BtnSuccess
                          onClick={() => void saveVehicleCargoVolume(false, selectedVehicle.type)}
                          disabled={saving || !cargoInput}
                        >
                          Corriger le volume
                        </BtnSuccess>
                        {selectedVehicle.cargoVolumeM3 != null && (
                          <BtnDanger
                            onClick={() => void saveVehicleCargoVolume(true, selectedVehicle.type)}
                            disabled={saving}
                          >
                            Effacer
                          </BtnDanger>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {selectedVehicle.typeApprovalNotes && vehicleTypeStatus === "REJECTED" && (
                  <p className="text-xs">
                    Motif du refus : <em>{selectedVehicle.typeApprovalNotes}</em>
                  </p>
                )}
                {selectedVehicle.typeApprovedAt && vehicleTypeStatus === "APPROVED" && (
                  <p className="text-xs opacity-80">
                    Validé le {new Date(selectedVehicle.typeApprovedAt).toLocaleString("fr-FR")}
                  </p>
                )}
                {canReviewKyc && vehicleTypeStatus !== "APPROVED" && (
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={vehicleTypeRejectNotes}
                      onChange={(e) => setVehicleTypeRejectNotes(e.target.value)}
                      placeholder="Motif du refus (ex. photo = moto, catégorie VIP déclarée) — optionnel"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-800 bg-white"
                      rows={2}
                    />
                    <div className="flex flex-wrap gap-2">
                      <BtnSuccess onClick={() => reviewVehicleType(true)} disabled={saving}>
                        {canSetVehicleType && selectedVehicleType && selectedVehicleType !== selectedVehicle.type
                          ? "Valider et enregistrer ce type"
                          : "Valider ce type d'engin"}
                      </BtnSuccess>
                      <BtnDanger onClick={() => reviewVehicleType(false)} disabled={saving}>
                        Refuser le type déclaré
                      </BtnDanger>
                    </div>
                  </div>
                )}
                {canReviewKyc && vehicleTypeStatus === "APPROVED" && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-green-200/80">
                    {canSetVehicleType && selectedVehicleType && selectedVehicleType !== selectedVehicle.type && (
                      <BtnSuccess onClick={() => reviewVehicleType(true)} disabled={saving}>
                        Enregistrer le nouveau type
                      </BtnSuccess>
                    )}
                    <BtnDanger onClick={() => reviewVehicleType(false)} disabled={saving}>
                      Révoquer la validation du type
                    </BtnDanger>
                  </div>
                )}
              </div>
            )}

            {selected.vehicles && selected.vehicles.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Véhicules</p>
                <ul className="text-sm space-y-2">
                  {selected.vehicles.map((v) => (
                      <li key={v.id} className="bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex gap-3 items-start">
                          {v.imageUrl ? (
                            <AuthenticatedMedia
                              url={v.imageUrl}
                              alt=""
                              className="w-16 h-12 object-cover rounded border shrink-0"
                            />
                          ) : null}
                          <div>
                            {VEHICLE_TYPE_LABELS[v.type] ?? v.type} · {v.plateNumber}
                            {v.make && ` · ${v.make} ${v.model ?? ""}`}
                            {v.color ? ` · ${v.color}` : ""}
                            <span className="block text-xs text-gray-500 mt-0.5">
                              {vehicleSeatsLabel(v)}
                              {vehicleCargoLabel(v) ? ` · ${vehicleCargoLabel(v)}` : ""}
                            </span>
                            {v.typeApprovalStatus && (
                              <span className="block text-xs text-gray-500 mt-0.5">
                                Validation type : {vehicleTypeApprovalLabel(v.typeApprovalStatus)}
                              </span>
                            )}
                            {!v.imageUrl && <span className="block text-xs text-gray-400 mt-1">Photo non fournie</span>}
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <Link href="/kyc" className="text-sm text-[#6C63FF] hover:underline inline-block">
              → Voir documents KYC en attente
            </Link>
            {canReviewKyc && selected.kycStatus !== "APPROVED" && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <BtnSuccess
                  onClick={() => reviewKyc(true)}
                  disabled={
                    saving ||
                    !(selected.kycAllJustificatifsApproved || allJustificatifsApproved(selected.kyc?.checklist))
                  }
                >
                  Approuver KYC
                </BtnSuccess>
                {selected.kycStatus !== "REJECTED" && (
                  <BtnDanger onClick={() => reviewKyc(false)} disabled={saving}>
                    Rejeter KYC
                  </BtnDanger>
                )}
              </div>
            )}
            {canReviewKyc && selected.kycStatus === "APPROVED" && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <BtnDanger onClick={() => reviewKyc(false)} disabled={saving}>
                  Révoquer KYC
                </BtnDanger>
              </div>
            )}
            {canEditOperatingCity && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-xs text-gray-500">Ville d&apos;opération — SuperAdmin / Admin uniquement.</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1">
                    <SelectInput
                      value={editOperatingCity}
                      onChange={setEditOperatingCity}
                      disabled={saving}
                      options={[
                        { value: "", label: "Choisir une ville…" },
                        ...MOVA_CITIES.map((c) => ({ value: c, label: c })),
                        ...((detail?.operatingCity || selected.operatingCity) &&
                        !(MOVA_CITIES as readonly string[]).includes(
                          (detail?.operatingCity ?? selected.operatingCity ?? "").trim(),
                        )
                          ? [
                              {
                                value: (detail?.operatingCity ?? selected.operatingCity ?? "").trim(),
                                label: (detail?.operatingCity ?? selected.operatingCity ?? "").trim(),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                  <BtnSuccess
                    onClick={saveOperatingCity}
                    disabled={
                      saving ||
                      !editOperatingCity.trim() ||
                      editOperatingCity.trim() === (detail?.operatingCity ?? selected.operatingCity ?? "").trim()
                    }
                  >
                    Enregistrer la ville
                  </BtnSuccess>
                </div>
              </div>
            )}
            {!readOnly && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-xs text-gray-500">
                  Mode service — choisir ce que ce profil reçoit comme offres.
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["RIDES_ONLY", "DELIVERIES_ONLY", "BOTH"] as const).map((mode) => {
                    const active = resolveServiceMode(selected) === mode;
                    const label =
                      mode === "RIDES_ONLY"
                        ? "Limiter aux courses uniquement"
                        : mode === "DELIVERIES_ONLY"
                          ? "Limiter aux livraisons uniquement"
                          : "Courses et livraisons";
                    return (
                      <button
                        key={mode}
                        type="button"
                        disabled={saving || active}
                        onClick={() => setServiceMode(mode)}
                        className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${
                          active
                            ? "border-[#6C63FF] bg-[#6C63FF]/10 text-[#4F46E5] font-medium"
                            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {selected.isAvailable ? (
                    <BtnDanger onClick={() => setActionTarget({ driver: selected, activate: false })}>Suspendre</BtnDanger>
                  ) : (
                    <BtnSuccess onClick={() => setActionTarget({ driver: selected, activate: true })}>Activer</BtnSuccess>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onConfirm={toggleStatus}
        title={actionTarget?.activate ? "Activer le chauffeur" : "Suspendre le chauffeur"}
        message={actionTarget?.activate
          ? "Le chauffeur pourra à nouveau accepter des courses."
          : "Le chauffeur sera suspendu et son compte utilisateur désactivé."}
        confirmLabel={actionTarget?.activate ? "Activer" : "Suspendre"}
        danger={!actionTarget?.activate}
        loading={saving}
      />
    </div>
  );
}
