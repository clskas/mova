"use client";

import { useState } from "react";
import { describeVehicle } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";

/**
 * Texte de l'annonce + bouton « Rédiger avec l'IA » : Claude propose un texte à partir
 * des informations et des photos du véhicule ; le loueur le relit et le modifie.
 */
export function ListingDescriptionField({
  value,
  onChange,
  vehicle,
}: {
  value: string;
  onChange: (text: string) => void;
  vehicle: () => Record<string, unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ missing: string[]; highlights: string[]; en: string; mismatch: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setBusy(true);
    setError(null);
    try {
      const res = await describeVehicle(vehicle());
      if (!res.available || !res.description) {
        setError(res.message ?? "Rédaction automatique indisponible pour le moment.");
        return;
      }
      onChange(res.description);
      setInfo({
        missing: res.missing ?? [],
        highlights: res.highlights ?? [],
        en: res.descriptionEn ?? "",
        mismatch: res.photosMatchVehicle === false,
      });
    } catch (e) {
      setError(toUserErrorMessage(e, "Rédaction impossible"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="block text-sm space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-600">Description de l&apos;annonce</span>
        <button
          type="button"
          onClick={() => void draft()}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50"
          title="Ajoutez d'abord le nom et au moins une photo"
        >
          {busy ? "Rédaction…" : "Rédiger avec l'IA"}
        </button>
      </div>
      <textarea
        className="w-full rounded-xl border p-3"
        rows={5}
        maxLength={2000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Présentez le véhicule : état, confort, usage idéal (ville, route, mariage…)"
      />
      {error && <p className="text-xs text-amber-700">{error}</p>}
      {info && (
        <div className="rounded-xl bg-indigo-50 p-3 text-xs text-indigo-900 space-y-1">
          <p>Texte proposé par l&apos;IA : relisez-le et corrigez-le avant d&apos;enregistrer.</p>
          {info.mismatch && <p className="text-red-700">Les photos ne semblent pas correspondre au véhicule décrit.</p>}
          {info.highlights.length > 0 && <p>Points forts : {info.highlights.join(" · ")}</p>}
          {info.missing.length > 0 && <p>À compléter : {info.missing.join(" · ")}</p>}
          {info.en && (
            <details>
              <summary className="cursor-pointer">Version anglaise</summary>
              <p className="mt-1 whitespace-pre-line">{info.en}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
