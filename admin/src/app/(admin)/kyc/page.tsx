"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  activationPinSmsCopy,
  kycApprovedPinAlert,
  fetchDrivers,
  fetchKycPending,
  fetchPartnerKycPending,
  reviewDriverKyc,
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

export default function KycPage() {
  const { canWrite } = useAdmin();
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, drivers, partners] = await Promise.all([
        fetchKycPending(statusFilter),
        fetchDrivers(),
        fetchPartnerKycPending(statusFilter).catch(() => ({ restaurants: [], rentalPartners: [] })),
      ]);
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
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!loading) load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load, loading]);

  async function review(id: string, approved: boolean) {
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
      const result = await apiFetch<{
        activationPin?: string;
        loginPin?: string;
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
      if (approved && (result.activationPin || result.loginPin)) {
        window.alert(kycApprovedPinAlert(result));
      } else if (!approved) {
        window.alert(`Refus enregistré.\n\n${activationPinSmsCopy(result)}`);
      }
      load();
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
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la validation");
    }
  }

  async function reviewPartnerDoc(id: string, approved: boolean) {
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
      load();
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
      const result = await reviewPartnerKycSubject(subject, userId, approved, notes);
      if (approved && result.loginPin) {
        window.alert(kycApprovedPinAlert(result));
      } else if (!approved) {
        window.alert(`Refus enregistré.\n\n${activationPinSmsCopy(result)}`);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la validation");
    }
  }

  const q = search.trim().toLowerCase();

  const driverDossiers = useMemo(() => {
    const grouped = groupDriverDocs(items, allDrivers);
    return grouped
      .map((dossier) => ({
        ...dossier,
        docs: dossier.docs.filter((d) => !docTypeFilter || d.type === docTypeFilter),
      }))
      .filter((dossier) => {
        if (kindFilter && kindFilter !== "DRIVER") return false;
        if (!dossier.docs.length) return false;
        return matchesSearch(q, dossier.displayName, dossier.phone, dossier.email, dossier.publicId);
      });
  }, [items, allDrivers, kindFilter, docTypeFilter, q]);

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

  function partnerDocActions(item: PartnerKycChecklistItem) {
    if (!canWrite("kyc") || !item.documentId || item.status === "APPROVED") return null;
    return (
      <div className="flex gap-2 mt-2">
        <BtnSuccess onClick={() => reviewPartnerDoc(item.documentId!, true)}>Valider ce justificatif</BtnSuccess>
        <BtnDanger onClick={() => reviewPartnerDoc(item.documentId!, false)}>Refuser ce justificatif</BtnDanger>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="KYC" subtitle="Validation des dossiers chauffeurs, restaurants et loueurs" />
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
        </div>
      </div>
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      {loading ? (
        <LoadingState />
      ) : empty ? (
        <EmptyState message={q || kindFilter || docTypeFilter ? "Aucun dossier ne correspond aux filtres" : "Aucun KYC en attente"} />
      ) : (
        <div className="space-y-6">
          {driverDossiers.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Chauffeurs</h2>
              {driverDossiers.map((dossier) => (
                <Card key={dossier.userId} className="p-4 space-y-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <IdentityHeader
                      kind={dossier.partnerKindLabel}
                      name={dossier.displayName}
                      phone={dossier.phone}
                      email={dossier.email}
                      extra={dossier.publicId}
                    />
                    {canWrite("kyc") && statusFilter !== "APPROVED" && (
                      <div className="flex gap-2">
                        <BtnSuccess onClick={() => reviewDriver(dossier.userId, true)}>Approuver le dossier</BtnSuccess>
                        <BtnDanger onClick={() => reviewDriver(dossier.userId, false)}>Rejeter le dossier</BtnDanger>
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
                              <BtnSuccess onClick={() => review(k.id, true)}>Approuver</BtnSuccess>
                              <BtnDanger onClick={() => review(k.id, false)}>Rejeter</BtnDanger>
                            </div>
                          ) : null
                        }
                      />
                    ))}
                  </ul>
                </Card>
              ))}
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
                  <IdentityHeader
                    kind="Chauffeur"
                    name={driverNameFromProfile(d) || "Chauffeur"}
                    phone={d.phone}
                    email={d.email}
                    extra={d.publicId}
                  />
                  <div>
                    <StatusBadge status={d.kycStatus} />
                    {!d.onboardingCompleted && (
                      <p className="text-xs text-amber-600 mt-1">Enregistrement en cours</p>
                    )}
                    {d.onboardingCompleted && d.kycStatus === "PENDING" && (
                      <p className="text-xs text-green-700 mt-1 font-medium">Dossier complet — prêt à valider</p>
                    )}
                  </div>
                  {canWrite("kyc") && (
                    <div className="flex gap-2">
                      <BtnSuccess onClick={() => reviewDriver(d.userId, true)}>Approuver</BtnSuccess>
                      {d.kycStatus !== "REJECTED" && (
                        <BtnDanger onClick={() => reviewDriver(d.userId, false)}>Rejeter</BtnDanger>
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
                return (
                  <Card key={r.restaurantId ?? r.userId ?? name} className="p-4 space-y-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <IdentityHeader kind={kind} name={name} phone={r.phone} email={r.email} />
                        <div className="mt-1"><StatusBadge status={r.kycStatus} /></div>
                        {!r.phoneVerified && <p className="text-xs text-amber-700 mt-1">Téléphone +243 non lié</p>}
                      </div>
                      {canWrite("kyc") && r.userId && r.kycStatus !== "APPROVED" && (
                        <div className="flex gap-2">
                          <BtnSuccess onClick={() => reviewPartner("RESTAURANT", r.userId!, true)}>Approuver</BtnSuccess>
                          <BtnDanger onClick={() => reviewPartner("RESTAURANT", r.userId!, false)}>Rejeter</BtnDanger>
                        </div>
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
                          actions={partnerDocActions(item)}
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
                return (
                  <Card key={r.userId} className="p-4 space-y-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <IdentityHeader kind={kind} name={name} phone={r.phone} email={r.email} />
                        <div className="mt-1"><StatusBadge status={r.kycStatus} /></div>
                      </div>
                      {canWrite("kyc") && r.userId && r.kycStatus !== "APPROVED" && (
                        <div className="flex gap-2">
                          <BtnSuccess onClick={() => reviewPartner("RENTAL_PARTNER", r.userId!, true)}>Approuver</BtnSuccess>
                          <BtnDanger onClick={() => reviewPartner("RENTAL_PARTNER", r.userId!, false)}>Rejeter</BtnDanger>
                        </div>
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
                          actions={partnerDocActions(item)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl p-4 max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
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
