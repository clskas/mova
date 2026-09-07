"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, activationPinSmsCopy, fetchDrivers, fetchPartnerKycPending, reviewDriverKyc, reviewPartnerKycDocument, reviewPartnerKycSubject, type AdminDriver, type KycItem, type PartnerKycChecklistItem, type PartnerKycDossier } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnDanger,
  BtnSuccess,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function resolveDocumentUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function driverDisplayName(d: AdminDriver) {
  const full = [d.firstName, d.lastName].filter(Boolean).join(" ").trim();
  return full || d.publicId || `${d.userId.slice(0, 8)}…`;
}

function dossierName(r: PartnerKycDossier) {
  return r.displayName || r.name || r.userId?.slice(0, 8) || "Partenaire";
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

type DriverDossier = {
  userId: string;
  displayName: string;
  publicId?: string;
  phone?: string | null;
  email?: string | null;
  partnerKindLabel: string;
  docs: KycItem[];
};

function groupDriverDocs(items: KycItem[]): DriverDossier[] {
  const map = new Map<string, KycItem[]>();
  for (const item of items) {
    const key = item.userId ?? item.id;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([userId, docs]) => {
    const first = docs[0];
    return {
      userId,
      displayName: first.displayName || first.publicId || `Chauffeur ${userId.slice(0, 8)}…`,
      publicId: first.publicId,
      phone: first.phone,
      email: first.email,
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
      {url && (
        onPreview ? (
          <button type="button" onClick={onPreview} className="mt-2 text-xs text-[#6C63FF] hover:underline">
            Voir le justificatif
          </button>
        ) : (
          <a href={resolveDocumentUrl(url) ?? "#"} target="_blank" rel="noreferrer" className="text-xs text-[#6C63FF]">
            Voir le justificatif
          </a>
        )
      )}
      {actions}
    </li>
  );
}

export default function KycPage() {
  const { canWrite } = useAdmin();
  const [items, setItems] = useState<KycItem[]>([]);
  const [pendingDrivers, setPendingDrivers] = useState<AdminDriver[]>([]);
  const [restaurants, setRestaurants] = useState<PartnerKycDossier[]>([]);
  const [rentalPartners, setRentalPartners] = useState<PartnerKycDossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<KycItem | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, drivers, partners] = await Promise.all([
        apiFetch<KycItem[]>("/api/admin/kyc/pending"),
        fetchDrivers(),
        fetchPartnerKycPending().catch(() => ({ restaurants: [], rentalPartners: [] })),
      ]);
      setItems(Array.isArray(data) ? data : []);
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
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!loading) load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load, loading]);

  useEffect(() => {
    if (!preview?.url) {
      setPreviewBlobUrl(null);
      return;
    }
    const full = resolveDocumentUrl(preview.url);
    if (!full) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(full, { headers: authHeaders() })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("HTTP " + res.status))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewBlobUrl(full);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [preview]);

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
      }>(`/api/admin/kyc/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ approved, notes }),
      });
      if (approved && (result.activationPin || result.loginPin)) {
        window.alert(
          `Dossier validé.\n\nPIN d'activation : ${result.activationPin ?? "—"}\nPIN de connexion : ${result.loginPin ?? "—"}\n\n${activationPinSmsCopy(result)}`,
        );
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
        window.alert(
          `Dossier validé.\n\nPIN d'activation : ${result.activationPin ?? "—"}\nPIN de connexion : ${result.loginPin ?? "—"}\n\n${activationPinSmsCopy(result)}`,
        );
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
      await reviewPartnerKycDocument(id, approved, notes);
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
        window.alert(`Dossier validé.\n\nPIN de connexion : ${result.loginPin}\n\n${activationPinSmsCopy(result)}`);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la validation");
    }
  }

  const driverDossiers = useMemo(() => groupDriverDocs(items), [items]);
  const driverDocUserIds = useMemo(() => new Set(driverDossiers.map((d) => d.userId)), [driverDossiers]);
  const driversWithoutDocs = pendingDrivers.filter((d) => !driverDocUserIds.has(d.userId));

  const empty =
    items.length === 0 && pendingDrivers.length === 0 && restaurants.length === 0 && rentalPartners.length === 0;

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
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      {loading ? (
        <LoadingState />
      ) : empty ? (
        <EmptyState message="Aucun KYC en attente" />
      ) : (
        <div className="space-y-6">
          {driverDossiers.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Chauffeurs — justificatifs en attente</h2>
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
                  </div>
                  <ul className="text-sm space-y-2">
                    {dossier.docs.map((k) => (
                      <DocumentRow
                        key={k.id}
                        label={k.typeLabel || k.type || "Justificatif"}
                        forWhom={`Pour ${dossier.partnerKindLabel} ${dossier.displayName}`}
                        status={k.status}
                        notes={k.notes}
                        url={k.url}
                        onPreview={k.url ? () => setPreview(k) : undefined}
                        actions={
                          canWrite("kyc") ? (
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
                    name={driverDisplayName(d)}
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
          {restaurants.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Restaurants</h2>
              {restaurants.map((r) => {
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
                      {canWrite("kyc") && r.userId && (
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
                          label={item.label}
                          forWhom={`Pour ${kind} ${name}`}
                          status={item.status ?? (item.uploaded ? "Envoyé" : "Manquant")}
                          notes={item.notes}
                          url={item.url}
                          actions={partnerDocActions(item)}
                        />
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
          {rentalPartners.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Loueurs</h2>
              {rentalPartners.map((r) => {
                const name = dossierName(r);
                const kind = dossierKind(r);
                return (
                  <Card key={r.userId} className="p-4 space-y-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <IdentityHeader kind={kind} name={name} phone={r.phone} email={r.email} />
                        <div className="mt-1"><StatusBadge status={r.kycStatus} /></div>
                      </div>
                      {canWrite("kyc") && r.userId && (
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
                          label={item.label}
                          forWhom={`Pour ${kind} ${name}`}
                          status={item.status ?? (item.uploaded ? "Envoyé" : "Manquant")}
                          notes={item.notes}
                          url={item.url}
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
            <p className="font-medium mb-1">{preview.typeLabel || preview.type}</p>
            <p className="text-sm text-gray-600 mb-3">
              {preview.partnerKindLabel || "Chauffeur"} {preview.displayName || preview.publicId || preview.userId}
              {preview.phone ? ` · ${preview.phone}` : ""}
              {preview.email ? ` · ${preview.email}` : ""}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewBlobUrl ?? resolveDocumentUrl(preview.url) ?? preview.url} alt="Document KYC" className="w-full rounded-lg border" />
            <button type="button" onClick={() => setPreview(null)} className="mt-4 text-sm text-gray-500 underline">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
