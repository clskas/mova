"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchKyc, updateKycProfile, uploadKycDocument, type RentalKycDossier } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";
import { ImageSourcePicker } from "@/components/ImageSourcePicker";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente de validation",
  APPROVED: "Validé",
  REJECTED: "À corriger",
};

export default function RentalDossierPage() {
  const [dossier, setDossier] = useState<RentalKycDossier | null>(null);
  const [partnerType, setPartnerType] = useState<"COMPANY" | "INDIVIDUAL">("INDIVIDUAL");
  const [nif, setNif] = useState("");
  const [rccm, setRccm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchKyc();
      setDossier(d);
      setPartnerType(d.partnerType ?? "INDIVIDUAL");
      setNif(d.nif ?? "");
      setRccm(d.rccm ?? "");
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de charger le dossier"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const d = await updateKycProfile({ partnerType, nif, rccm });
      setDossier(d);
      setMessage("Informations enregistrées. SENGA vérifiera votre dossier avant publication des véhicules.");
    } catch (err) {
      setError(toUserErrorMessage(err, "Enregistrement impossible"));
    } finally {
      setSaving(false);
    }
  }

  async function onFile(type: string, file: File | undefined) {
    if (!file) return;
    setUploading(type);
    setError(null);
    try {
      const d = await uploadKycDocument(type, file);
      setDossier(d);
      setMessage("Justificatif envoyé.");
    } catch (err) {
      setError(toUserErrorMessage(err, "Envoi impossible"));
    } finally {
      setUploading(null);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>;

    return (
    <div className="space-y-6 max-w-2xl pb-8">
      <div>
        <h1 className="text-xl font-semibold text-[#1A1A2E]">Mon dossier</h1>
        <p className="text-sm text-gray-600 mt-1">
          Entreprise : RCCM, NIF, statuts, identité du gérant, preuve de siège. Particulier : pièce
          d&apos;identité et preuve d&apos;adresse. Les papiers de chaque véhicule restent demandés à
          l&apos;ajout du véhicule.
        </p>
      </div>
      {error && <p className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      {message && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-xl px-3 py-2">{message}</p>}
      <p className="text-sm font-medium">
        Statut : {STATUS_LABEL[dossier?.kycStatus ?? "PENDING"] ?? dossier?.kycStatus}
      </p>
      {dossier?.kycNotes && (
        <p className="text-sm text-red-800 bg-red-50 rounded-xl px-3 py-2">Motif : {dossier.kycNotes}</p>
      )}
      {!dossier?.canOperate && (
        <p className="text-sm text-amber-900 bg-amber-50 rounded-xl px-3 py-2">
          Vous pourrez publier des véhicules une fois le dossier validé.
        </p>
      )}

      <form onSubmit={saveProfile} className="bg-white rounded-2xl border p-4 space-y-3">
        <h2 className="font-medium">Type de partenaire</h2>
        <select
          className="w-full rounded-xl border p-3 text-sm"
          value={partnerType}
          onChange={(e) => setPartnerType(e.target.value as "COMPANY" | "INDIVIDUAL")}
        >
          <option value="INDIVIDUAL">Particulier</option>
          <option value="COMPANY">Entreprise</option>
        </select>
        {partnerType === "COMPANY" && (
          <>
            <label className="block text-sm">
              RCCM
              <input className="mt-1 w-full rounded-xl border p-3" value={rccm} onChange={(e) => setRccm(e.target.value)} />
            </label>
            <label className="block text-sm">
              NIF
              <input className="mt-1 w-full rounded-xl border p-3" value={nif} onChange={(e) => setNif(e.target.value)} />
            </label>
          </>
        )}
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>

      <div className="bg-white rounded-2xl border p-4 space-y-3">
        <h2 className="font-medium">Justificatifs</h2>
        {(dossier?.checklist ?? []).map((item) => (
          <div key={item.type} className="rounded-xl bg-gray-50 p-3 text-sm space-y-1">
            <div className="flex justify-between gap-2">
              <span>
                {item.label}
                {item.required ? " *" : ""}
              </span>
              <span className={item.uploaded ? "text-emerald-700" : "text-gray-500"}>
                {item.status === "REJECTED" ? "Refusé" : item.uploaded ? "Envoyé" : "À envoyer"}
              </span>
            </div>
            {item.notes && item.status === "REJECTED" && (
              <p className="text-red-700">Motif : {item.notes}</p>
            )}
            <ImageSourcePicker
              disabled={uploading === item.type}
              onSelect={(file) => onFile(item.type, file)}
              label={uploading === item.type ? "Envoi…" : item.uploaded ? "Remplacer" : "Joindre un justificatif"}
              accept="image/*,.pdf"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
