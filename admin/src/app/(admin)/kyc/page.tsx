"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  activationPinSmsCopy,
  kycApprovedPinAlert,
  fetchDrivers,
  fetchKycPending,
  fetchPartnerKycPending,
  reviewDriverKyc,
  regeneratePartnerLoginPin,
  reviewPartnerKycDocument,
  reviewPartnerKycSubject,
  apiFetch,
  type AdminDriver,
  type KycItem,
  type PartnerKycChecklistItem,
  type PartnerKycDossier,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { AuthenticatedMedia } from "@/components/AuthenticatedMedia";
import { KYC_DOC_LABELS, kycDocLabel, personDisplayName } from "@/lib/kyc-labels";
import {
  BtnDanger,
  BtnSuccess,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  SearchInput,
  StatusBadge,
} from "@/components/ui";

function driverNameFromProfile(d?: AdminDriver | null) {
  if (!d) return "";
  return personDisplayName({
    firstName: d.firstName,
    lastName: d.lastName,
    phone: d.phone,
    publicId: d.publicId,
    fallback: "",
  });
}

function dossierName(r: PartnerKycDossier) {
  return personDisplayName({
    displayName: r.displayName,
    fallback: r.name || r.phone || "Partenaire",
  });
}

function dossierKind(r: PartnerKycDossier) {
  if (r.partnerKindLabel) return r.partnerKindLabel;
  if (r.subject === "RESTAURANT") return "Restaurant";
  if (r.partnerType === "COMPANY") return "Location (entreprise)";
  if (r.partnerType === "INDIVIDUAL") return "Location (particulier)";
  return "Location";
}

function contactLine(phone?: string | null, email?: string | null) {
  const parts = [phone, email].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Coordonnées non renseignées";
}

function matchesSearch(q: string, ...values: Array<string | null | undefined>) {
  if (!q) return true;
  return values.some((v) => (v ?? "").toLowerCase().includes(q));
}

type DriverDossier = {
  userId: string;
  displayName: string;
  publicId?: string;
  phone?: string | null;
  email?: string | null;
  partnerKindLabel: string;
  docs: KycItem[];
};

function groupDriverDocs(items: KycItem[], drivers: AdminDriver[]): DriverDossier[] {
  const byUser = new Map(drivers.map((d) => [d.userId, d]));
  const map = new Map<string, KycItem[]>();
  for (const item of items) {
    const key = item.userId ?? item.id;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([userId, docs]) => {
    const first = docs[0];
    const driver = byUser.get(userId);
    return {
      userId,
      displayName: personDisplayName({
        displayName: first.displayName,
        firstName: driver?.firstName,
        lastName: driver?.lastName,
        phone: first.phone || driver?.phone,
        publicId: first.publicId || driver?.publicId,
        fallback: "Chauffeur",
      }),
      publicId: first.publicId || driver?.publicId,
      phone: first.phone || driver?.phone,
      email: first.email || driver?.email,
      partnerKindLabel: first.partnerKindLabel || "Chauffeur",
      docs,
    };
  });
}

function IdentityHeader({
  kind,
  name,
  phone,
  email,
  extra,
}: {
  kind: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  extra?: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6C63FF]">{kind}</p>
      <p className="font-medium">{name}</p>
      <p className="text-sm text-gray-600">{contactLine(phone, email)}</p>
      {extra ? <p className="text-xs text-gray-400 mt-0.5">{extra}</p> : null}
    </div>
  );
}

function DocumentRow({
  label,
  forWhom,
  status,
  notes,
  url,
  onPreview,
  actions,
}: {
  label: string;
  forWhom: string;
  status?: string | null;
  notes?: string | null;
  url?: string | null;
  onPreview?: () => void;
  actions?: ReactNode;
}) {
  return (
    <li className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="flex justify-between gap-2">
        <div>
          <span className="font-medium">{label}</span>
          <p className="text-xs text-gray-500 mt-0.5">{forWhom}</p>
        </div>
        {status ? <StatusBadge status={status} /> : null}
      </div>
      {notes && <p className="text-xs text-red-700 mt-1">Motif : {notes}</p>}
      {url && onPreview && (
        <button type="button" onClick={onPreview} className="mt-2 text-xs text-[#6C63FF] hover:underline">
          Voir le justificatif
        </button>
      )}
      {actions}
    </li>
  );
}

const KIND_OPTIONS = [
  { value: "", label: "Tous les types" },
  { value: "DRIVER", label: "Chauffeur" },
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "RENTAL", label: "Location" },
];

const STATUS_OPTIONS = [
  { value: "PENDING", label: "En attente" },
  { value: "APPROVED", label: "Approuvé" },
  { value: "REJECTED", label: "Rejeté" },
  { value: "ALL", label: "Tous les statuts" },
];

const DOC_TYPE_OPTIONS = [
  { value: "", label: "Tous les justificatifs" },
  ...Object.entries(KYC_DOC_LABELS).map(([value, label]) => ({ value, label })),
];

function partnerStageLabel(r: PartnerKycDossier) {
  if (r.kycStatus === "APPROVED") {
    return r.pinPending || !r.pinConfigured ? "KYC OK — PIN à transmettre" : "Actif (PIN configuré)";
  }
  if (r.kycStatus === "REJECTED") return "Dossier refusé";
  if (allJustificatifsApproved(r.checklist)) return "Documents OK — Approuver le dossier";
  return "Dossier en attente";
}

function driverStageLabel(
  docs: Array<{ type?: string; status?: string | null }>,
  driver?: AdminDriver | null,
) {
  if (driver?.kycStatus === "APPROVED") {
    return driver.activationPinVerified ? "Actif (PIN configuré)" : "KYC OK — PIN à transmettre";
  }
  if (driver?.kycStatus === "REJECTED") return "Dossier refusé";
  if (allDriverDocsApproved(docs, driver)) return "Documents OK — Approuver le dossier";
  return "Dossier en attente";
}

function isOpenDocStatus(status?: string | null) {
  const s = String(status ?? "").toUpperCase();
  return s === "PENDING" || s === "REJECTED";
}

function dossierNeedsAdminAction(
  docs: Array<{ status?: string | null }>,
  driver?: AdminDriver | null,
  statusFilter?: string,
) {
  const filter = String(statusFilter ?? "PENDING").toUpperCase();
  const profileStatus = String(driver?.kycStatus ?? "").toUpperCase();
  const hasOpenDocs = docs.some((d) => isOpenDocStatus(d.status));
  const allDocsApproved =
    docs.length > 0 && docs.every((d) => String(d.status ?? "").toUpperCase() === "APPROVED");
  if (filter === "ALL") return true;
  if (filter === "APPROVED") {
    return profileStatus === "APPROVED" || docs.some((d) => String(d.status ?? "").toUpperCase() === "APPROVED");
  }
  if (filter === "REJECTED") {
    return profileStatus === "REJECTED" || docs.some((d) => String(d.status ?? "").toUpperCase() === "REJECTED");
  }
  // PENDING: keep dossiers awaiting « Approuver le dossier » even when every doc is APPROVED
  if (profileStatus === "APPROVED" && !hasOpenDocs) return false;
  if (profileStatus === "PENDING" || profileStatus === "REJECTED" || driver?.readyForReview) return true;
  // Profile missing from drivers list: still keep if docs need review OR all are APPROVED
  // (awaiting dossier PIN — never drop after last justificatif approve).
  if (!driver) return hasOpenDocs || allDocsApproved;
  return hasOpenDocs || (allDocsApproved && profileStatus !== "APPROVED");
}

/** Aligné sur packages/shared REQUIRED_DRIVER_KYC_TYPES (6 justificatifs). */
const REQUIRED_DRIVER_KYC_TYPES = [
  "ID_PHOTO",
  "SELFIE",
  "DRIVERS_LICENSE",
  "VEHICLE_REGISTRATION",
  "VEHICLE_INSURANCE",
  "TECHNICAL_INSPECTION",
] as const;

function allJustificatifsApproved(
  items: Array<{ required?: boolean; uploaded?: boolean; status?: string | null }> | undefined,
): boolean {
  const list = items ?? [];
  const relevant = list.filter((item) => item.required || item.uploaded);
  return relevant.length > 0 && relevant.every((item) => String(item.status ?? "").toUpperCase() === "APPROVED");
}

function missingPartnerDocLabels(
  items: Array<{ required?: boolean; uploaded?: boolean; status?: string | null; type?: string; label?: string }> | undefined,
): string[] {
  const list = items ?? [];
  return list
    .filter((item) => item.required || item.uploaded)
    .filter((item) => String(item.status ?? "").toUpperCase() !== "APPROVED")
    .map((item) => kycDocLabel(item.type, item.label));
}

function missingDocsMessage(labels: string[]): string | null {
  if (!labels.length) return null;
  return `Il manque encore : ${labels.join(", ")}`;
}

function missingDriverDocTypes(
  docs: Array<{ type?: string; status?: string | null }>,
): string[] {
  return REQUIRED_DRIVER_KYC_TYPES.filter(
    (type) =>
      !docs.some(
        (doc) =>
          String(doc.type ?? "").toUpperCase() === type &&
          String(doc.status ?? "").toUpperCase() === "APPROVED",
      ),
  );
}

/** Types obligatoires jamais déposés (pas encore dans la liste admin). */
function absentDriverDocTypes(docs: Array<{ type?: string }>): string[] {
  return REQUIRED_DRIVER_KYC_TYPES.filter(
    (type) => !docs.some((doc) => String(doc.type ?? "").toUpperCase() === type),
  );
}

function missingDriverDocLabels(docs: Array<{ type?: string; status?: string | null }>): string[] {
  return missingDriverDocTypes(docs).map((type) => kycDocLabel(type));
}

function allDriverDocsApproved(
  docs: Array<{ type?: string; status?: string | null }>,
  driver?: { kycAllJustificatifsApproved?: boolean } | null,
): boolean {
  if (driver?.kycAllJustificatifsApproved === true) return true;
  return missingDriverDocTypes(docs).length === 0;
}

function partnerAccountLabel(r: PartnerKycDossier) {
  if (r.orphan || r.hiddenReason === "orphan") return "Sans compte (fantôme)";
  if (r.hiddenReason === "play_prelaunch") return "Test Lab";
  if (r.userRole && r.userRole !== "RESTAURANT" && r.userRole !== "RENTAL_PARTNER") {
    return `Rôle compte : ${r.userRole}`;
  }
  return null;
}

export default function KycPage() {
  const { canWrite, role } = useAdmin();
  const [items, setItems] = useState<KycItem[]>([]);
  const [pendingDrivers, setPendingDrivers] = useState<AdminDriver[]>([]);
  const [allDrivers, setAllDrivers] = useState<AdminDriver[]>([]);
  const [restaurants, setRestaurants] = useState<PartnerKycDossier[]>([]);
  const [rentalPartners, setRentalPartners] = useState<PartnerKycDossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<KycItem | null>(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [pinBanner, setPinBanner] = useState<{ title: string; pin?: string; notice: string } | null>(null);
  const [focusedUserId, setFocusedUserId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    // Soft reload keeps cards visible after last-doc approve (no LoadingState flash).
    if (!opts?.soft) setLoading(true);
    setError(null);
    try {
      // Backend PENDING now returns docs for PENDING dossiers even when all justificatifs
      // are APPROVED (awaiting « Approuver le dossier » / PIN). Do NOT switch to ALL —
      // a global ALL take:500 used to drown those rows under historical APPROVED docs.
      const [data, pendingOnly, rejectedOnly, partners] = await Promise.all([
        fetchKycPending(statusFilter),
        // Fetch PENDING/REJECTED profiles explicitly — unfiltered take:500 by createdAt
        // mostly returns APPROVED drivers and drops the dossier awaiting PIN.
        fetchDrivers(includeHidden, { take: 500, kycStatus: "PENDING" }),
        fetchDrivers(includeHidden, { take: 200, kycStatus: "REJECTED" }),
        fetchPartnerKycPending(statusFilter, includeHidden).catch(() => ({ restaurants: [], rentalPartners: [] })),
      ]);
      const drivers = [...pendingOnly, ...rejectedOnly];
      setItems(Array.isArray(data) ? data : []);
      setAllDrivers(drivers);
      setPendingDrivers(
        drivers.filter(
          (d) =>
            d.kycStatus === "PENDING" ||
            d.kycStatus === "REJECTED" ||
            (d.readyForReview && d.kycStatus === "PENDING"),
        ),
      );
      setRestaurants(partners.restaurants ?? []);
      setRentalPartners(partners.rentalPartners ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, includeHidden]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!loading) void load({ soft: true });
    }, 15000);
    return () => clearInterval(timer);
  }, [load, loading]);

  async function review(id: string, approved: boolean, userId?: string) {
    try {
      let notes: string | undefined;
      if (!approved) {
        const motif = window.prompt("Motif du refus (visible par le chauffeur) :");
        if (!motif || motif.trim().length < 8) {
          setError("Indiquez le motif du refus (au moins 8 caractères).");
          return;
        }
        notes = motif.trim();
      }
      // Document-level review only — PIN is issued solely via « Approuver le dossier ».
      const result = await apiFetch<{
        smsSent?: boolean;
        hasPhone?: boolean;
        smsError?: string;
        emailSent?: boolean;
        hasEmail?: boolean;
        emailError?: string;
      }>(`/api/admin/kyc/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ approved, notes }),
      });
      if (!approved) {
        window.alert(`Refus enregistré.\n\n${activationPinSmsCopy(result)}`);
      }
      // Optimistic: keep dossier on screen with updated doc status before soft reload.
      if (userId) setFocusedUserId(userId);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: approved ? "APPROVED" : "REJECTED", notes: notes ?? item.notes }
            : item,
        ),
      );
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la validation");
    }
  }

  async function reviewDriver(userId: string, approved: boolean) {
    try {
      let notes: string | undefined;
      if (!approved) {
        const motif = window.prompt("Motif du refus (visible par le chauffeur) :");
        if (!motif || motif.trim().length < 8) {
          setError("Indiquez le motif du refus (au moins 8 caractères).");
          return;
        }
        notes = motif.trim();
      }
      const result = await reviewDriverKyc(userId, approved, notes);
      if (approved && (result.activationPin || result.loginPin)) {
        window.alert(kycApprovedPinAlert(result));
      } else if (!approved) {
        window.alert(`Refus enregistré.\n\n${activationPinSmsCopy(result)}`);
      }
      setFocusedUserId(null);
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la validation");
    }
  }

  async function reviewPartnerDoc(id: string, approved: boolean, userId?: string) {
    try {
      let notes: string | undefined;
      if (!approved) {
        const motif = window.prompt("Motif du refus (visible par le partenaire) :");
        if (!motif || motif.trim().length < 8) {
          setError("Indiquez le motif du refus (au moins 8 caractères).");
          return;
        }
        notes = motif.trim();
      }
      const result = await reviewPartnerKycDocument(id, approved, notes);
      if (!approved) {
        window.alert(`Refus enregistré.\n\n${activationPinSmsCopy(result)}`);
      }
      if (userId) setFocusedUserId(userId);
      const patchChecklist = (list: PartnerKycDossier[]) =>
        list.map((dossier) => {
          if (userId && dossier.userId !== userId) return dossier;
          return {
            ...dossier,
            checklist: (dossier.checklist ?? []).map((item) =>
              item.documentId === id
                ? { ...item, status: approved ? "APPROVED" : "REJECTED", notes: notes ?? item.notes }
                : item,
            ),
          };
        });
      setRestaurants(patchChecklist);
      setRentalPartners(patchChecklist);
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la validation");
    }
  }

  async function reviewPartner(subject: "RESTAURANT" | "RENTAL_PARTNER", userId: string, approved: boolean) {
    try {
      let notes: string | undefined;
      if (!approved) {
        const motif = window.prompt("Motif du refus (visible par le partenaire) :");
        if (!motif || motif.trim().length < 8) {
          setError("Indiquez le motif du refus (au moins 8 caractères).");
          return;
        }
        notes = motif.trim();
      }
      if (approved) {
        const dossier = [...restaurants, ...rentalPartners].find((d) => d.userId === userId);
        const hasPhone = Boolean(dossier?.phoneVerified || dossier?.phone);
        const hasEmail = Boolean(dossier?.email?.trim());
        if (!hasPhone && !hasEmail) {
          setError("Liez un +243 ou un e-mail avant d'approuver / pour envoyer le PIN.");
          return;
        }
        if (!hasPhone && hasEmail) {
          const ok = window.confirm(
            "Aucun numéro +243 lié. Le PIN partira uniquement par e-mail. Continuer ?",
          );
          if (!ok) return;
        }
      }
      const result = await reviewPartnerKycSubject(subject, userId, approved, notes);
      if (approved) {
        setPinBanner({
          title: result.loginPin ? "Dossier validé — PIN à transmettre" : "Dossier validé",
          pin: result.loginPin,
          notice: activationPinSmsCopy(result) || "PIN généré. Transmettez-le au partenaire si le SMS / e-mail n'arrive pas.",
        });
        if (result.loginPin) window.alert(kycApprovedPinAlert(result));
      } else {
        window.alert(`Refus enregistré.\n\n${activationPinSmsCopy(result)}`);
      }
      setFocusedUserId(null);
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la validation");
    }
  }

  async function resendPartnerPin(subject: "RESTAURANT" | "RENTAL_PARTNER", userId: string, name: string) {
    try {
      const result = await regeneratePartnerLoginPin(subject, userId);
      setPinBanner({
        title: `PIN ${name}`,
        pin: result.loginPin,
        notice: activationPinSmsCopy(result),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de renvoyer le PIN");
    }
  }

  const q = search.trim().toLowerCase();

  const driversByUserId = useMemo(() => new Map(allDrivers.map((d) => [d.userId, d])), [allDrivers]);

  const driverDossiers = useMemo(() => {
    const grouped = groupDriverDocs(items, allDrivers);
    return grouped
      .map((dossier) => {
        const allDocs = dossier.docs;
        const docs = allDocs.filter((d) => !docTypeFilter || d.type === docTypeFilter);
        return { ...dossier, allDocs, docs };
      })
      .filter((dossier) => {
        if (kindFilter && kindFilter !== "DRIVER") return false;
        const driver = driversByUserId.get(dossier.userId);
        if (docTypeFilter && !dossier.docs.length) return false;
        // Approval / queue logic must use the full set, not the doc-type filter slice.
        if (!dossierNeedsAdminAction(dossier.allDocs, driver, statusFilter)) return false;
        // Keep PENDING dossiers with zero open docs (all APPROVED) so « Approuver le dossier » stays reachable
        if (!dossier.allDocs.length && !(driver?.kycStatus === "PENDING" || driver?.readyForReview)) return false;
        return matchesSearch(q, dossier.displayName, dossier.phone, dossier.email, dossier.publicId);
      });
  }, [items, allDrivers, driversByUserId, kindFilter, docTypeFilter, q, statusFilter]);

  const driverDocUserIds = useMemo(() => new Set(driverDossiers.map((d) => d.userId)), [driverDossiers]);
  const showDriversWithoutDocs =
    (statusFilter === "PENDING" || statusFilter === "ALL") &&
    (!kindFilter || kindFilter === "DRIVER") &&
    !docTypeFilter;
  const driversWithoutDocs = showDriversWithoutDocs
    ? pendingDrivers.filter((d) => {
        if (driverDocUserIds.has(d.userId)) return false;
        if (statusFilter === "PENDING" && d.kycStatus !== "PENDING" && !d.readyForReview) return false;
        return matchesSearch(
          q,
          driverNameFromProfile(d),
          d.phone,
          d.email,
          d.publicId,
        );
      })
    : [];

  const filteredRestaurants = useMemo(() => {
    if (kindFilter && kindFilter !== "RESTAURANT") return [];
    return restaurants
      .map((r) => ({
        ...r,
        checklist: (r.checklist ?? []).filter((item) => !docTypeFilter || item.type === docTypeFilter),
      }))
      .filter((r) => {
        if (docTypeFilter && !(r.checklist ?? []).length) return false;
        return matchesSearch(q, dossierName(r), r.phone, r.email, r.name);
      });
  }, [restaurants, kindFilter, docTypeFilter, q]);

  const filteredRentals = useMemo(() => {
    if (kindFilter && kindFilter !== "RENTAL") return [];
    return rentalPartners
      .map((r) => ({
        ...r,
        checklist: (r.checklist ?? []).filter((item) => !docTypeFilter || item.type === docTypeFilter),
      }))
      .filter((r) => {
        if (docTypeFilter && !(r.checklist ?? []).length) return false;
        return matchesSearch(q, dossierName(r), r.phone, r.email, r.name);
      });
  }, [rentalPartners, kindFilter, docTypeFilter, q]);

  const empty =
    driverDossiers.length === 0 &&
    driversWithoutDocs.length === 0 &&
    filteredRestaurants.length === 0 &&
    filteredRentals.length === 0;

  function partnerDocActions(item: PartnerKycChecklistItem, userId?: string | null) {
    if (!canWrite("kyc") || !item.documentId || item.status === "APPROVED") return null;
    return (
      <div className="flex gap-2 mt-2">
        <BtnSuccess onClick={() => reviewPartnerDoc(item.documentId!, true, userId ?? undefined)}>
          Valider ce justificatif
        </BtnSuccess>
        <BtnDanger onClick={() => reviewPartnerDoc(item.documentId!, false, userId ?? undefined)}>
          Refuser ce justificatif
        </BtnDanger>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="KYC" subtitle="Validation des dossiers chauffeurs, restaurants et loueurs" />
      <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 space-y-1">
        <p className="font-semibold">Validation en deux étapes</p>
        <p>
          1) Approuvez chaque justificatif individuellement. 2) Quand tous les types obligatoires sont validés
          (chauffeur : 6, dont assurance véhicule), le dossier reste visible (« Documents OK — Approuver le dossier »)
          — cliquez alors le bouton vert pour générer et afficher le PIN. Le PIN n&apos;est jamais créé à la
          validation d&apos;un seul document.
        </p>
        <p>
          Sans +243 ni e-mail, le PIN s&apos;affiche quand même à l&apos;écran (SMS/e-mail optionnels). Sur un
          dossier déjà validé, utilisez « Renvoyer le PIN ».
        </p>
      </div>
      <div className="mb-4 space-y-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher par nom, téléphone ou e-mail…"
          className="max-w-none"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="rounded-xl border-0 bg-white p-3 shadow-sm text-sm"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border-0 bg-white p-3 shadow-sm text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
            className="rounded-xl border-0 bg-white p-3 shadow-sm text-sm min-w-[12rem]"
          >
            {DOC_TYPE_OPTIONS.map((o) => (
              <option key={o.value || "all-docs"} value={o.value}>{o.label}</option>
            ))}
          </select>
          {role === "SUPER_ADMIN" && (
            <label className="flex items-center gap-2 text-sm text-gray-600 px-1">
              <input
                type="checkbox"
                checked={includeHidden}
                onChange={(e) => setIncludeHidden(e.target.checked)}
              />
              Afficher les profils fantômes / Test Lab
            </label>
          )}
        </div>
      </div>
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={() => void load()} /></div>}
      {pinBanner && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-950">{pinBanner.title}</p>
          {pinBanner.pin && (
            <p className="font-mono text-2xl tracking-widest mt-2 text-amber-950">{pinBanner.pin}</p>
          )}
          <p className="text-amber-800 mt-1 text-xs">{pinBanner.notice}</p>
        </div>
      )}
      {loading ? (
        <LoadingState />
      ) : empty ? (
        <EmptyState message={q || kindFilter || docTypeFilter ? "Aucun dossier ne correspond aux filtres" : "Aucun KYC en attente"} />
      ) : (
        <div className="space-y-6">
          {driverDossiers.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Chauffeurs</h2>
              {driverDossiers.map((dossier) => {
                const driver = driversByUserId.get(dossier.userId);
                const reviewDocs = dossier.allDocs;
                const docsApproved = allDriverDocsApproved(reviewDocs, driver);
                const missingLabels = missingDriverDocLabels(reviewDocs);
                const missingMsg = missingDocsMessage(missingLabels);
                const absentTypes = absentDriverDocTypes(reviewDocs);
                const focused = focusedUserId === dossier.userId;
                const showDossierActions =
                  canWrite("kyc") &&
                  statusFilter !== "APPROVED" &&
                  (driver ? driver.kycStatus !== "APPROVED" : statusFilter === "PENDING");
                const noContact = !dossier.phone?.trim() && !dossier.email?.trim();
                return (
                <Card
                  key={dossier.userId}
                  className={`p-4 space-y-3${focused ? " ring-2 ring-green-500" : ""}`}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <IdentityHeader
                        kind={dossier.partnerKindLabel}
                        name={dossier.displayName}
                        phone={dossier.phone}
                        email={dossier.email}
                        extra={dossier.publicId}
                      />
                      <p className="text-xs text-gray-600 mt-1">{driverStageLabel(reviewDocs, driver)}</p>
                      {docsApproved && showDossierActions && (
                        <p className="text-xs text-green-700 mt-1 font-medium">
                          Tous les justificatifs sont validés — vous pouvez approuver le dossier (PIN).
                        </p>
                      )}
                      {noContact && showDossierActions && (
                        <p className="text-xs text-amber-700 mt-1">
                          Pas de +243 / e-mail — le PIN s&apos;affichera à l&apos;écran (SMS non envoyé).
                        </p>
                      )}
                    </div>
                    {showDossierActions && (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex gap-2">
                          <BtnSuccess
                            disabled={!docsApproved}
                            onClick={() => reviewDriver(dossier.userId, true)}
                          >
                            {docsApproved ? "Documents OK — Approuver le dossier" : "Approuver le dossier"}
                          </BtnSuccess>
                          <BtnDanger onClick={() => reviewDriver(dossier.userId, false)}>Rejeter le dossier</BtnDanger>
                        </div>
                        {!docsApproved && missingMsg && (
                          <p className="text-xs text-amber-800 max-w-sm text-right">{missingMsg}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <ul className="text-sm space-y-2">
                    {dossier.docs.map((k) => (
                      <DocumentRow
                        key={k.id}
                        label={kycDocLabel(k.type, k.typeLabel)}
                        forWhom={`Pour ${dossier.partnerKindLabel} ${dossier.displayName}`}
                        status={k.status}
                        notes={k.notes}
                        url={k.url}
                        onPreview={k.url ? () => setPreview(k) : undefined}
                        actions={
                          canWrite("kyc") && k.status !== "APPROVED" ? (
                            <div className="flex gap-2 mt-2">
                              <BtnSuccess onClick={() => review(k.id, true, dossier.userId)}>Approuver</BtnSuccess>
                              <BtnDanger onClick={() => review(k.id, false, dossier.userId)}>Rejeter</BtnDanger>
                            </div>
                          ) : null
                        }
                      />
                    ))}
                    {!docTypeFilter &&
                      absentTypes.map((type) => (
                        <DocumentRow
                          key={`missing-${type}`}
                          label={kycDocLabel(type)}
                          forWhom={`Pour ${dossier.partnerKindLabel} ${dossier.displayName}`}
                          status="Manquant"
                        />
                      ))}
                  </ul>
                </Card>
                );
              })}
            </div>
          )}
          {driversWithoutDocs.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">
                Chauffeurs sans validation complète
                {items.length === 0 && (
                  <span className="block font-normal text-gray-500 mt-1">
                    Aucun document en attente — validez le profil chauffeur directement.
                  </span>
                )}
              </h2>
              {driversWithoutDocs.map((d) => (
                <Card key={d.id} className="p-4 flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <IdentityHeader
                      kind="Chauffeur"
                      name={driverNameFromProfile(d) || "Chauffeur"}
                      phone={d.phone}
                      email={d.email}
                      extra={d.publicId}
                    />
                    <p className="text-xs text-gray-600 mt-1">{driverStageLabel([], d)}</p>
                  </div>
                  <div>
                    <StatusBadge status={d.kycStatus} />
                    {!d.onboardingCompleted && (
                      <p className="text-xs text-amber-600 mt-1">Enregistrement en cours</p>
                    )}
                    {d.kycAllJustificatifsApproved && d.kycStatus === "PENDING" && (
                      <p className="text-xs text-green-700 mt-1 font-medium">
                        Documents OK — Approuver le dossier
                      </p>
                    )}
                    {d.onboardingCompleted && d.kycStatus === "PENDING" && !d.kycAllJustificatifsApproved && (
                      <p className="text-xs text-amber-800 mt-1 font-medium">
                        Il manque encore des justificatifs obligatoires (6 requis, dont assurance véhicule).
                      </p>
                    )}
                    {!d.phone?.trim() && !d.email?.trim() && d.kycStatus === "PENDING" && (
                      <p className="text-xs text-amber-700 mt-1">
                        Pas de +243 / e-mail — le PIN s&apos;affichera à l&apos;écran (SMS non envoyé).
                      </p>
                    )}
                  </div>
                  {canWrite("kyc") && (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex gap-2">
                        <BtnSuccess
                          disabled={!d.kycAllJustificatifsApproved}
                          onClick={() => reviewDriver(d.userId, true)}
                        >
                          {d.kycAllJustificatifsApproved
                            ? "Documents OK — Approuver le dossier"
                            : "Approuver le dossier"}
                        </BtnSuccess>
                        {d.kycStatus !== "REJECTED" && (
                          <BtnDanger onClick={() => reviewDriver(d.userId, false)}>Rejeter</BtnDanger>
                        )}
                      </div>
                      {!d.kycAllJustificatifsApproved && d.kycStatus === "PENDING" && (
                        <p className="text-xs text-amber-800 max-w-sm text-right">
                          Il manque encore des justificatifs obligatoires (6 requis, dont assurance véhicule).
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
          {filteredRestaurants.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Restaurants</h2>
              {filteredRestaurants.map((r) => {
                const name = dossierName(r);
                const kind = dossierKind(r);
                const checklist = restaurants.find((d) => d.userId === r.userId)?.checklist ?? r.checklist;
                const docsOk = allJustificatifsApproved(checklist);
                const partnerMissingMsg = missingDocsMessage(missingPartnerDocLabels(checklist));
                const focused = focusedUserId === r.userId;
                return (
                  <Card
                    key={r.restaurantId ?? r.userId ?? name}
                    className={`p-4 space-y-3${focused ? " ring-2 ring-green-500" : ""}`}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <IdentityHeader kind={kind} name={name} phone={r.phone} email={r.email} />
                        <div className="mt-1"><StatusBadge status={r.kycStatus} /></div>
                        <p className="text-xs text-gray-600 mt-1">{partnerStageLabel(r)}</p>
                        {partnerAccountLabel(r) && (
                          <p className="text-xs text-amber-800 mt-1">{partnerAccountLabel(r)}</p>
                        )}
                        {!docsOk && partnerMissingMsg && (
                          <p className="text-xs text-amber-800 mt-1 font-medium">{partnerMissingMsg}</p>
                        )}
                        {!r.phoneVerified && !r.email?.trim() && (
                          <p className="text-xs text-amber-700 mt-1">
                            Pas de +243 / e-mail — le PIN s&apos;affichera à l&apos;écran (SMS non envoyé).
                          </p>
                        )}
                        {!r.phoneVerified && r.email?.trim() && (
                          <p className="text-xs text-amber-700 mt-1">
                            Téléphone +243 non lié — le PIN partira par e-mail uniquement
                          </p>
                        )}
                      </div>
                      {canWrite("kyc") && r.userId && r.kycStatus !== "APPROVED" && (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex gap-2">
                            <BtnSuccess
                              disabled={!docsOk}
                              onClick={() => reviewPartner("RESTAURANT", r.userId!, true)}
                            >
                              {docsOk ? "Documents OK — Approuver le dossier" : "Approuver le dossier"}
                            </BtnSuccess>
                            <BtnDanger onClick={() => reviewPartner("RESTAURANT", r.userId!, false)}>Rejeter le dossier</BtnDanger>
                          </div>
                          {!docsOk && partnerMissingMsg && (
                            <p className="text-xs text-amber-800 max-w-sm text-right">{partnerMissingMsg}</p>
                          )}
                        </div>
                      )}
                      {canWrite("kyc") && r.userId && r.kycStatus === "APPROVED" && (
                        <button
                          type="button"
                          className="text-sm text-[#6C63FF] hover:underline"
                          onClick={() => resendPartnerPin("RESTAURANT", r.userId!, name)}
                        >
                          {r.pinPending ? "Générer / renvoyer le PIN" : "Renvoyer le PIN"}
                        </button>
                      )}
                    </div>
                    <ul className="text-sm space-y-2">
                      {(r.checklist ?? []).map((item) => (
                        <DocumentRow
                          key={item.type}
                          label={kycDocLabel(item.type, item.label)}
                          forWhom={`Pour ${kind} ${name}`}
                          status={item.status ?? (item.uploaded ? "Envoyé" : "Manquant")}
                          notes={item.notes}
                          url={item.url}
                          onPreview={item.url ? () => setPreview({
                            id: item.documentId ?? item.type,
                            type: item.type,
                            typeLabel: kycDocLabel(item.type, item.label),
                            url: item.url ?? undefined,
                            displayName: name,
                            phone: r.phone,
                            email: r.email,
                            partnerKindLabel: kind,
                          }) : undefined}
                          actions={partnerDocActions(item, r.userId)}
                        />
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
          {filteredRentals.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Loueurs</h2>
              {filteredRentals.map((r) => {
                const name = dossierName(r);
                const kind = dossierKind(r);
                const checklist = rentalPartners.find((d) => d.userId === r.userId)?.checklist ?? r.checklist;
                const docsOk = allJustificatifsApproved(checklist);
                const partnerMissingMsg = missingDocsMessage(missingPartnerDocLabels(checklist));
                const focused = focusedUserId === r.userId;
                return (
                  <Card
                    key={r.userId}
                    className={`p-4 space-y-3${focused ? " ring-2 ring-green-500" : ""}`}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <IdentityHeader kind={kind} name={name} phone={r.phone} email={r.email} />
                        <div className="mt-1"><StatusBadge status={r.kycStatus} /></div>
                        <p className="text-xs text-gray-600 mt-1">{partnerStageLabel(r)}</p>
                        {partnerAccountLabel(r) && (
                          <p className="text-xs text-amber-800 mt-1">{partnerAccountLabel(r)}</p>
                        )}
                        {!docsOk && partnerMissingMsg && (
                          <p className="text-xs text-amber-800 mt-1 font-medium">{partnerMissingMsg}</p>
                        )}
                        {!r.phoneVerified && !r.email?.trim() && (
                          <p className="text-xs text-amber-700 mt-1">
                            Pas de +243 / e-mail — le PIN s&apos;affichera à l&apos;écran (SMS non envoyé).
                          </p>
                        )}
                        {!r.phoneVerified && r.email?.trim() && (
                          <p className="text-xs text-amber-700 mt-1">
                            Téléphone +243 non lié — le PIN partira par e-mail uniquement
                          </p>
                        )}
                      </div>
                      {canWrite("kyc") && r.userId && r.kycStatus !== "APPROVED" && (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex gap-2">
                            <BtnSuccess
                              disabled={!docsOk}
                              onClick={() => reviewPartner("RENTAL_PARTNER", r.userId!, true)}
                            >
                              {docsOk ? "Documents OK — Approuver le dossier" : "Approuver le dossier"}
                            </BtnSuccess>
                            <BtnDanger onClick={() => reviewPartner("RENTAL_PARTNER", r.userId!, false)}>Rejeter le dossier</BtnDanger>
                          </div>
                          {!docsOk && partnerMissingMsg && (
                            <p className="text-xs text-amber-800 max-w-sm text-right">{partnerMissingMsg}</p>
                          )}
                        </div>
                      )}
                      {canWrite("kyc") && r.userId && r.kycStatus === "APPROVED" && (
                        <button
                          type="button"
                          className="text-sm text-[#6C63FF] hover:underline"
                          onClick={() => resendPartnerPin("RENTAL_PARTNER", r.userId!, name)}
                        >
                          {r.pinPending ? "Générer / renvoyer le PIN" : "Renvoyer le PIN"}
                        </button>
                      )}
                    </div>
                    <ul className="text-sm space-y-2">
                      {(r.checklist ?? []).map((item) => (
                        <DocumentRow
                          key={item.type}
                          label={kycDocLabel(item.type, item.label)}
                          forWhom={`Pour ${kind} ${name}`}
                          status={item.status ?? (item.uploaded ? "Envoyé" : "Manquant")}
                          notes={item.notes}
                          url={item.url}
                          onPreview={item.url ? () => setPreview({
                            id: item.documentId ?? item.type,
                            type: item.type,
                            typeLabel: kycDocLabel(item.type, item.label),
                            url: item.url ?? undefined,
                            displayName: name,
                            phone: r.phone,
                            email: r.email,
                            partnerKindLabel: kind,
                          }) : undefined}
                          actions={partnerDocActions(item, r.userId)}
                        />
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {preview?.url && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 overflow-y-auto overscroll-contain" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-4 max-w-2xl w-full max-h-[min(92dvh,92vh)] min-h-0 overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium mb-1">{kycDocLabel(preview.type, preview.typeLabel)}</p>
            <p className="text-sm text-gray-600 mb-3">
              {preview.partnerKindLabel || "Chauffeur"} {preview.displayName || preview.phone || preview.publicId}
              {preview.phone ? ` · ${preview.phone}` : ""}
              {preview.email ? ` · ${preview.email}` : ""}
            </p>
            <AuthenticatedMedia
              url={preview.url}
              alt="Document KYC"
              className="w-full rounded-lg border"
              fallback="Justificatif introuvable."
            />
            <button type="button" onClick={() => setPreview(null)} className="mt-4 text-sm text-gray-500 underline">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
