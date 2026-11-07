"use client";

import { useState } from "react";
import { updateSeatLimits, type ClientAppsConfig, type SeatLimits } from "@/lib/api";

export const DEFAULT_SEAT_LIMITS: SeatLimits = {
  carMaxPassengers: 4,
  familialeMinSeats: 5,
  familialeMaxSeats: 8,
  tricycleMaxSeats: 3,
};

const FIELDS: Array<{ key: keyof SeatLimits; label: string; hint: string; min: number; max: number }> = [
  {
    key: "carMaxPassengers",
    label: "Standard, Confort et VIP — passagers au maximum",
    hint: "Au-delà, l’app passager passe en gamme Familiale (si elle est activée).",
    min: 1,
    max: 8,
  },
  {
    key: "familialeMinSeats",
    label: "Familiale — places au minimum",
    hint: "Un véhicule Familiale doit déclarer au moins ce nombre de places.",
    min: 2,
    max: 20,
  },
  {
    key: "familialeMaxSeats",
    label: "Familiale — places au maximum",
    hint: "Plus grand groupe qu’un passager peut demander.",
    min: 5,
    max: 20,
  },
  {
    key: "tricycleMaxSeats",
    label: "Tricycle à passagers — places au maximum",
    hint: "Ex. 4 ou 5 pour les tricycles plus grands. Les chauffeurs déclarent leurs places dans cette limite.",
    min: 1,
    max: 10,
  },
];

/** Admin and super admin: seat limits per range (apps and dispatch follow them). */
export function SeatLimitsEditor({
  config,
  canEdit,
  onSaved,
}: {
  config: ClientAppsConfig;
  canEdit: boolean;
  onSaved: (next: ClientAppsConfig) => void;
}) {
  const [value, setValue] = useState<SeatLimits>({ ...DEFAULT_SEAT_LIMITS, ...(config.seatLimits ?? {}) });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (value.familialeMinSeats > value.familialeMaxSeats) {
      setMessage("Le minimum Familiale doit être inférieur ou égal au maximum.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const next = await updateSeatLimits(value);
      setValue({ ...DEFAULT_SEAT_LIMITS, ...(next.seatLimits ?? {}) });
      onSaved(next);
      setMessage("Nombre de places enregistré. Les apps l’appliquent à leur prochaine ouverture.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 px-4 py-3 space-y-3" data-testid="seat-limits">
      <div>
        <p className="text-sm font-medium text-slate-800">Nombre de places par gamme</p>
        <p className="text-xs text-slate-500">
          Modifiable par les Administrateurs et Super admins. S’applique aux déclarations des chauffeurs, à
          l’envoi des courses et au choix du nombre de passagers dans l’app.
        </p>
      </div>
      {FIELDS.map((f) => (
        <label key={f.key} className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="font-medium text-slate-800 block">{f.label}</span>
            <span className="text-xs text-slate-500">{f.hint}</span>
          </span>
          <input
            type="number"
            min={f.min}
            max={f.max}
            className="w-20 rounded-lg border px-2 py-1 text-right"
            value={value[f.key]}
            disabled={!canEdit || saving}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n)) setValue({ ...value, [f.key]: Math.min(f.max, Math.max(f.min, n)) });
            }}
          />
        </label>
      ))}
      {canEdit ? (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="text-sm px-3 py-1.5 rounded-lg bg-[#6C63FF] text-white disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer le nombre de places"}
        </button>
      ) : (
        <p className="text-xs text-amber-700">Lecture seule — réservé aux Administrateurs et Super admins.</p>
      )}
      {message && <p className="text-xs text-slate-600">{message}</p>}
    </div>
  );
}
