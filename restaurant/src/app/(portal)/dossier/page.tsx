"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchKyc,
  updateKycProfile,
  uploadKycDocument,
  type RestaurantKycDossier,
} from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";
import { ImageSourcePicker } from "@/components/ImageSourcePicker";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente de validation",
  APPROVED: "Validé",
  REJECTED: "À corriger",
};

export default function RestaurantDossierPage() {
  const [dossier, setDossier] = useState<RestaurantKycDossier | null>(null);
  const [nif, setNif] = useState("");
  const [rccm, setRccm] = useState("");
  const [payoutProvider, setPayoutProvider] = useState("ORANGE_MONEY");
  const [payoutPhone, setPayoutPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchKyc();
      setDossier(d);
      setNif(d.nif ?? "");
      setRccm(d.rccm ?? "");
      setPayoutProvider(d.payoutProvider ?? "ORANGE_MONEY");
      setPayoutPhone(d.payoutPhone ?? "");
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
      const d = await updateKycProfile({ nif, rccm, payoutProvider, payoutPhone });
      setDossier(d);
      setMessage("Informations enregistrées. SENGA vérifiera votre dossier.");
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
          SENGA vérifie votre identité, votre activité et votre local avant d&apos;afficher le restaurant et
          d&apos;accepter des commandes.
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
      {!dossier?.phoneVerified && (
        <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2">
          Reliez un numéro +243 à votre compte (Compte et connexion) pour finaliser le dossier.
        </p>
      )}

      <form onSubmit={saveProfile} className="bg-white rounded-2xl border p-4 space-y-3">
        <h2 className="font-medium">Informations à vérifier</h2>
        <label className="block text-sm">
          RCCM ou preuve d&apos;activité
          <input className="mt-1 w-full rounded-xl border p-3" value={rccm} onChange={(e) => setRccm(e.target.value)} />
        </label>
        <label className="block text-sm">
          NIF (si disponible)
          <input className="mt-1 w-full rounded-xl border p-3" value={nif} onChange={(e) => setNif(e.target.value)} />
        </label>
        <label className="block text-sm">
          Mobile Money
          <select
            className="mt-1 w-full rounded-xl border p-3"
            value={payoutProvider}
            onChange={(e) => setPayoutProvider(e.target.value)}
          >
            <option value="ORANGE_MONEY">Orange Money</option>
            <option value="MPESA">M-Pesa</option>
            <option value="AIRTEL_MONEY">Airtel Money</option>
          </select>
        </label>
        <label className="block text-sm">
          Numéro de paiement (+243)
          <input
            className="mt-1 w-full rounded-xl border p-3"
            value={payoutPhone}
            onChange={(e) => setPayoutPhone(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-[#FF6B35] text-white text-sm font-medium disabled:opacity-60"
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
