"use client";

import { useState } from "react";
import { checkDriverVehiclePhotos, type VehiclePhotoCheck } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  MOTO_TAXI: "Moto-taxi",
  STANDARD: "Standard",
  COMFORT: "Confort",
  VIP: "VIP",
  FAMILIALE: "Familiale",
  UTILITAIRE: "Utilitaire",
  CAMION: "Camion",
  TRICYCLE: "Tricycle",
  TRIPOTEUR: "Tripoteur",
  AUTRE: "Autre",
};

const VERDICT = {
  OK: { label: "Photos conformes", cls: "bg-green-50 border-green-200 text-green-800" },
  A_VERIFIER: { label: "À vérifier", cls: "bg-amber-50 border-amber-200 text-amber-900" },
  PROBLEME: { label: "Problème détecté", cls: "bg-red-50 border-red-200 text-red-800" },
} as const;

type Props = {
  userId: string;
  check?: VehiclePhotoCheck | null;
  canRun: boolean;
  onChecked?: () => void;
};

/** Claude's check of the vehicle photos against the declaration. The admin decides. */
export function VehiclePhotoCheckCard({ userId, check, canRun, onChecked }: Props) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<VehiclePhotoCheck | null | undefined>(check);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await checkDriverVehiclePhotos(userId);
      if (res?.photoCheck) setCurrent(res.photoCheck);
      else if (res?.message) setError(res.message);
      onChecked?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vérification impossible");
    } finally {
      setRunning(false);
    }
  }

  const verdict = current?.verdict ? VERDICT[current.verdict] : null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs space-y-1 max-w-xl">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-slate-800">Vérification des photos (IA)</span>
        {canRun && (
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="text-[#6C63FF] hover:underline disabled:opacity-50"
          >
            {running ? "Analyse…" : current ? "Relancer" : "Vérifier les photos (IA)"}
          </button>
        )}
      </div>
      {!current && !error && <p className="text-slate-500">Pas encore vérifiées.</p>}
      {error && <p className="text-red-700">{error}</p>}
      {current && (
        <div className={`rounded border px-2 py-1 space-y-0.5 ${verdict?.cls ?? ""}`}>
          {verdict && <p className="font-semibold">{verdict.label}</p>}
          {current.detectedType && (
            <p>
              Type vu sur les photos : <strong>{TYPE_LABELS[current.detectedType] ?? current.detectedType}</strong>
              {current.matchesDeclaredType === false ? " — différent du type déclaré" : ""}
            </p>
          )}
          {current.plateVisible && current.plateText && (
            <p>
              Plaque lue : {current.plateText}
              {current.plateMatchesDeclared === false ? " — différente de la plaque déclarée" : ""}
            </p>
          )}
          {current.estimatedPassengerSeats != null && <p>Places estimées : {current.estimatedPassengerSeats}</p>}
          {current.estimatedCargoVolumeM3 != null && (
            <p>
              Volume estimé : ~{current.estimatedCargoVolumeM3} m³
              {current.volumePlausible === false ? " — volume déclaré peu plausible" : ""}
            </p>
          )}
          {(current.issues ?? []).length > 0 && (
            <ul className="list-disc list-inside">
              {current.issues!.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          {current.notes && <p className="opacity-80">{current.notes}</p>}
          {current.checkedAt && (
            <p className="opacity-60">
              {current.photosChecked ?? "?"} photo(s) analysée(s) le {new Date(current.checkedAt).toLocaleString("fr-FR")}
            </p>
          )}
        </div>
      )}
      <p className="text-slate-400">L&apos;IA aide à repérer les écarts ; la validation reste la vôtre.</p>
    </div>
  );
}
