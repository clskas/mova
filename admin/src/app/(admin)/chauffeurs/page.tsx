"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchDriverDetail,
  fetchDrivers,
  regenerateDriverActivationPin,
  reviewDriverKyc,
  setDriverStatus,
  type AdminDriver,
  type AdminDriverDetail,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnDanger,
  BtnSuccess,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  StatusBadge,
} from "@/components/ui";

const KYC_DOC_LABELS: Record<string, string> = {
  ID_PHOTO: "Carte d'identité",
  SELFIE: "Photo profil",
  DRIVERS_LICENSE: "Permis",
  VEHICLE_REGISTRATION: "Carte grise",
  VEHICLE_INSURANCE: "Assurance",
  TECHNICAL_INSPECTION: "Visite technique",
  CRIMINAL_RECORD: "Casier judiciaire",
};

function driverStageLabel(d: AdminDriver | AdminDriverDetail): string {
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
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("chauffeurs");
  const canReviewKyc = canWrite("kyc");
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminDriverDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ driver: AdminDriver; activate: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [activationPin, setActivationPin] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDrivers();
      setDrivers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setActivationPin(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetchDriverDetail(selectedId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          if (d.activationPin) setActivationPin(d.activationPin);
          else setActivationPin(null);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter(
      (d) =>
        d.userId.toLowerCase().includes(q) ||
        d.publicId?.toLowerCase().includes(q) ||
        d.kycStatus?.toLowerCase().includes(q) ||
        d.vehicles?.some((v) => v.plateNumber.toLowerCase().includes(q))
    );
  }, [drivers, search]);

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
    setSaving(true);
    setError(null);
    try {
      const result = await reviewDriverKyc(selectedId, approved);
      if (approved && result.activationPin) {
        setActivationPin(result.activationPin);
      } else {
        setActivationPin(null);
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

  async function generatePin() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await regenerateDriverActivationPin(selectedId);
      setActivationPin(result.activationPin);
      const refreshed = await fetchDriverDetail(selectedId);
      setDetail(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de générer le PIN");
    } finally {
      setSaving(false);
    }
  }

  const selected = detail ?? drivers.find((d) => d.userId === selectedId) ?? null;

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Chauffeurs" subtitle={readOnly ? "Consultation profils chauffeurs" : "Profils chauffeurs, KYC et disponibilité"} />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      <div className="space-y-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher par ID MOVA, plaque ou statut KYC…" />
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
                  <th className="p-3">Étape</th>
                  <th className="p-3">Docs</th>
                  <th className="p-3">KYC</th>
                  <th className="p-3">Dispo</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{d.publicId ?? d.userId.slice(0, 8)}</td>
                    <td className="p-3 text-xs">{driverStageLabel(d)}</td>
                    <td className="p-3 text-xs">
                      {d.kycDocumentsUploaded ?? 0}/{d.kycDocumentsRequired ?? 6}
                      {d.onboardingCompleted && <span className="block text-green-600">Dossier envoyé</span>}
                    </td>
                    <td className="p-3"><StatusBadge status={d.kycStatus} /></td>
                    <td className="p-3">{d.isAvailable ? "✓ Oui" : "Non"}</td>
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
              <p><span className="text-gray-500">Identifiant MOVA:</span> <span className="font-mono font-medium">{selected.publicId ?? "—"}</span></p>
              <p><span className="text-gray-500">Téléphone:</span> {"user" in selected && selected.user?.phone ? selected.user.phone : "—"}</p>
              <p><span className="text-gray-500">Nom:</span> {"user" in selected ? [selected.user?.firstName, selected.user?.lastName].filter(Boolean).join(" ") || "—" : "—"}</p>
              <p><span className="text-gray-500">KYC:</span> <StatusBadge status={selected.kycStatus} /></p>
              <p><span className="text-gray-500">Étape:</span> {driverStageLabel(selected)}</p>
              <p><span className="text-gray-500">Dossier enregistrement:</span> {selected.onboardingCompleted ? "Soumis ✓" : "En cours"}</p>
              <p><span className="text-gray-500">Documents:</span> {selected.kycDocumentsUploaded ?? 0}/{selected.kycDocumentsRequired ?? 6} obligatoires</p>
              <p><span className="text-gray-500">PIN activé:</span> {selected.activationPinVerified ? "Oui" : "Non"}</p>
              <p><span className="text-gray-500">Note:</span> {selected.ratingAvg?.toFixed(1)} / 5</p>
              <p><span className="text-gray-500">Courses:</span> {selected.totalRides}</p>
              <p><span className="text-gray-500">Permis:</span> {selected.licenseNumber ?? "—"}</p>
              <p><span className="text-gray-500">N° identité:</span> {"idDocumentNumber" in selected ? selected.idDocumentNumber ?? "—" : "—"}</p>
              <p><span className="text-gray-500">Disponible:</span> {selected.isAvailable ? "Oui" : "Non"}</p>
              {"payoutProvider" in selected && selected.payoutProvider && (
                <p><span className="text-gray-500">Retrait:</span> {selected.payoutProvider} · {selected.payoutPhone ?? "—"}</p>
              )}
            </div>

            {activationPin && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm">
                <p className="font-semibold text-amber-900">
                  Code PIN d&apos;activation
                  {selected.activationPinVerified ? " (déjà activé par le chauffeur)" : " — à transmettre au chauffeur"}
                </p>
                <p className="font-mono text-2xl tracking-widest mt-2 text-amber-950">{activationPin}</p>
                {!selected.activationPinVerified && (
                  <p className="text-amber-800 mt-1 text-xs">
                    Le chauffeur saisit ce code dans l&apos;app (accueil → popup PIN) avant de passer en ligne.
                  </p>
                )}
              </div>
            )}

            {"canGenerateActivationPin" in selected && selected.canGenerateActivationPin && !activationPin && canReviewKyc && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm">
                <p className="text-blue-900">KYC approuvé mais aucun PIN actif. Générez un code pour ce chauffeur existant.</p>
                <button
                  type="button"
                  onClick={generatePin}
                  disabled={saving}
                  className="mt-2 px-4 py-2 rounded-lg bg-[#6C63FF] text-white text-sm font-medium disabled:opacity-50"
                >
                  Générer code PIN
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
                Régénérer un nouveau PIN
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

            {"kyc" in selected && selected.kyc?.checklist && selected.kyc.checklist.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Documents KYC</p>
                <ul className="text-sm space-y-1">
                  {selected.kyc.checklist.map((item) => (
                    <li key={item.type} className="flex justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <span>{item.label ?? KYC_DOC_LABELS[item.type] ?? item.type}</span>
                      <span className={item.uploaded ? "text-green-600" : "text-gray-400"}>
                        {item.uploaded ? `✓ ${item.status ?? "uploadé"}` : item.required ? "Manquant" : "Optionnel"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selected.vehicles && selected.vehicles.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Véhicules</p>
                <ul className="text-sm space-y-2">
                  {selected.vehicles.map((v) => {
                    const photo = v.imageUrl?.startsWith("http")
                      ? v.imageUrl
                      : v.imageUrl
                        ? `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}${v.imageUrl}`
                        : null;
                    return (
                      <li key={v.id} className="bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex gap-3 items-start">
                          {photo ? (
                            <img src={photo} alt="" className="w-16 h-12 object-cover rounded border shrink-0" />
                          ) : null}
                          <div>
                            {v.type} · {v.plateNumber} {v.make && `· ${v.make} ${v.model ?? ""}`}
                            {!photo && <span className="block text-xs text-gray-400 mt-1">Photo non fournie</span>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <Link href="/kyc" className="text-sm text-[#6C63FF] hover:underline inline-block">
              → Voir documents KYC en attente
            </Link>
            {canReviewKyc && selected.kycStatus !== "APPROVED" && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <BtnSuccess onClick={() => reviewKyc(true)} disabled={saving}>
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
            {!readOnly && (
              <div className="flex gap-2 pt-2">
                {selected.isAvailable ? (
                  <BtnDanger onClick={() => setActionTarget({ driver: selected, activate: false })}>Suspendre</BtnDanger>
                ) : (
                  <BtnSuccess onClick={() => setActionTarget({ driver: selected, activate: true })}>Activer</BtnSuccess>
                )}
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
