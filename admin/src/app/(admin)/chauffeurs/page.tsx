"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  activationPinSmsCopy,
  apiFetch,
  fetchDriverDetail,
  fetchDrivers,
  purgeDriverProfile,
  regenerateDriverActivationPin,
  reviewDriverKyc,
  reviewDriverDocumentsRenewal,
  reviewVehicleTypeApproval,
  runKycOcr,
  setDriverStatus,
  type AdminDriver,
  type AdminDriverDetail,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { AuthenticatedMedia, resolveMediaUrl } from "@/components/AuthenticatedMedia";
import { kycDocLabel, VEHICLE_TYPE_LABELS, VEHICLE_TYPE_OPTIONS } from "@/lib/kyc-labels";
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
      {ocr.checkedAt && (
        <p className="opacity-70">Analysé le {new Date(ocr.checkedAt).toLocaleString("fr-FR")}</p>
      )}
    </div>
  );
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
  const { canWrite, role } = useAdmin();
  const readOnly = !canWrite("chauffeurs");
  const canReviewKyc = canWrite("kyc");
  const canSetVehicleType = role === "SUPER_ADMIN" || role === "ADMIN";
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [search, setSearch] = useState("");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminDriverDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ driver: AdminDriver; activate: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [activationPin, setActivationPin] = useState<string | null>(null);
  const [smsNotice, setSmsNotice] = useState<string | null>(null);
  const [vehicleTypeRejectNotes, setVehicleTypeRejectNotes] = useState("");
  const [selectedVehicleType, setSelectedVehicleType] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDrivers(includeHidden);
      setDrivers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [includeHidden]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setActivationPin(null);
      setSmsNotice(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetchDriverDetail(selectedId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          const vehicle = activeDriverVehicle(d);
          setSelectedVehicleType(vehicle?.type ?? "");
          setVehicleTypeRejectNotes("");
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
        d.phone?.toLowerCase().includes(q) ||
        `${d.firstName ?? ""} ${d.lastName ?? ""}`.toLowerCase().includes(q) ||
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
      />
      <p className="text-sm text-gray-600 mb-4">
        <strong>Chauffeurs</strong> = dossier véhicule et KYC. <strong>Utilisateurs</strong> = comptes de connexion.
        Un chauffeur réel apparaît ici <em>et</em> dans Utilisateurs avec le rôle Chauffeur. Les profils sans compte
        (orphelins, Test Lab) sont masqués.
      </p>
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher par ID SENGA, nom, téléphone, plaque ou statut KYC…" />
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
                    <td className="p-3 text-xs">
                      {d.orphan || d.hiddenReason === "orphan" ? (
                        <span className="text-amber-800">Sans compte (fantôme)</span>
                      ) : (
                        <>
                          <span className="block font-medium text-gray-800">
                            {[d.firstName, d.lastName].filter(Boolean).join(" ") || d.phone || "—"}
                          </span>
                          {d.phone && <span className="block text-gray-500">{d.phone}</span>}
                          {d.userRole && d.userRole !== "DRIVER" && (
                            <span className="block text-amber-700">Rôle compte : {d.userRole}</span>
                          )}
                        </>
                      )}
                    </td>
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
              <p><span className="text-gray-500">Étape:</span> {driverStageLabel(selected)}</p>
              <p><span className="text-gray-500">Dossier enregistrement:</span> {selected.onboardingCompleted ? "Soumis ✓" : "En cours"}</p>
              <p><span className="text-gray-500">Documents:</span> {selected.kycDocumentsUploaded ?? 0}/{selected.kycDocumentsRequired ?? 6} obligatoires</p>
              <p><span className="text-gray-500">PIN activé:</span> {selected.activationPinVerified ? "Oui" : "Non"}</p>
              <p><span className="text-gray-500">Note:</span> {selected.ratingAvg?.toFixed(1)} / 5</p>
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
              <p><span className="text-gray-500">Disponible:</span> {selected.isAvailable ? "Oui" : "Non"}</p>
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
                <p className="text-blue-900">KYC approuvé mais aucun PIN actif. Envoyez un code SMS à ce chauffeur.</p>
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
                Renvoyer le PIN par SMS
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
                <ul className="text-sm space-y-1">
                  {selected.kyc.checklist.map((item) => (
                    <li key={item.type} className="bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                      <div className="flex justify-between">
                        <span>{item.label ?? kycDocLabel(item.type)}</span>
                        <span className={item.uploaded ? "text-green-600" : "text-gray-400"}>
                          {item.uploaded ? `✓ ${item.status ?? "uploadé"}` : item.required ? "Manquant" : "Optionnel"}
                        </span>
                      </div>
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
                <AuthenticatedMedia
                  url={selectedVehicle.imageUrl}
                  alt="Photo engin"
                  className="w-full max-w-xs h-36 object-cover rounded-lg border bg-white"
                  fallback="Photo de l'engin non fournie — demandez une mise à jour au chauffeur."
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
                            {VEHICLE_TYPE_LABELS[v.type] ?? v.type} · {v.plateNumber} {v.make && `· ${v.make} ${v.model ?? ""}`}
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
