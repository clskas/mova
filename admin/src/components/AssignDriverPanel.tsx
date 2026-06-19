"use client";

import { useMemo } from "react";
import type { AdminDriver } from "@/lib/api";
import { FieldLabel, SelectInput } from "@/components/ui";
import { driverOptionLabel } from "./AssignDriverSelect";

type AssignDriverPanelProps = {
  drivers: AdminDriver[];
  value: string;
  onChange: (driverUserId: string) => void;
  onAssign: () => void;
  disabled?: boolean;
  saving?: boolean;
  currentDriverId?: string | null;
  compact?: boolean;
};

export function AssignDriverPanel({
  drivers,
  value,
  onChange,
  onAssign,
  disabled,
  saving,
  currentDriverId,
  compact,
}: AssignDriverPanelProps) {
  const options = useMemo(
    () => [
      { value: "", label: "— Choisir un chauffeur —" },
      ...drivers.map((d) => ({
        value: d.userId,
        label: driverOptionLabel(d),
      })),
    ],
    [drivers],
  );

  const canAssign = !!value && value !== (currentDriverId ?? "") && !disabled && !saving;

  if (drivers.length === 0) {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Aucun chauffeur KYC approuvé. Validez un dossier dans <strong>Chauffeurs → KYC</strong> d&apos;abord.
      </p>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-2 min-w-[200px]">
        <SelectInput value={value} onChange={onChange} options={options} disabled={disabled || saving} />
        <button
          type="button"
          disabled={!canAssign}
          onClick={onAssign}
          className="px-3 py-1.5 rounded-lg bg-[#6C63FF] text-white text-xs font-medium disabled:opacity-40 hover:bg-[#5a52e0]"
        >
          {saving ? "…" : "Assigner"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-[#6C63FF]/30 bg-violet-50/40 p-4 space-y-3">
      <p className="font-semibold text-[#6C63FF]">Assigner un chauffeur</p>
      <FieldLabel>Chauffeur MOVA (KYC approuvé)</FieldLabel>
      <SelectInput value={value} onChange={onChange} options={options} disabled={disabled || saving} />
      <button
        type="button"
        disabled={!canAssign}
        onClick={onAssign}
        className="w-full px-4 py-2.5 rounded-xl bg-[#6C63FF] text-white text-sm font-medium disabled:opacity-40 hover:bg-[#5a52e0]"
      >
        {saving ? "Assignation…" : "Confirmer l'assignation"}
      </button>
      <p className="text-xs text-gray-500">
        L&apos;assignation passe automatiquement le statut à Confirmé (planifiée) ou Assigné (déménagement).
      </p>
    </div>
  );
}
