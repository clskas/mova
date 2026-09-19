"use client";

import { useMemo } from "react";
import type { AdminDriver } from "@/lib/api";
import { FieldLabel, SelectInput } from "@/components/ui";

type AssignDriverSelectProps = {
  drivers: AdminDriver[];
  value: string;
  onChange: (driverUserId: string) => void;
  disabled?: boolean;
};

export function driverDisplayName(d?: Pick<AdminDriver, "firstName" | "lastName"> | null): string | null {
  if (!d) return null;
  const name = [d.firstName, d.lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

export function driverOptionLabel(d: AdminDriver) {
  const name = driverDisplayName(d);
  const plate = d.vehicles?.[0]?.plateNumber;
  const id = d.publicId ?? d.userId.slice(0, 8);
  const duty =
    d.dutyStatus === "ON_TRIP"
      ? " · En course"
      : d.dutyStatus === "AVAILABLE"
        ? " · Dispo"
        : d.dutyStatus === "OFFLINE" || d.isAvailable === false
          ? " · Hors ligne"
          : "";
  if (name && plate) return `${name} · ${plate}${duty}`;
  if (name) return `${name} · ${id}${duty}`;
  return plate ? `${id} · ${plate}${duty}` : `${id}${duty}`;
}

export function AssignDriverSelect({ drivers, value, onChange, disabled }: AssignDriverSelectProps) {
  const options = useMemo(
    () => [
      { value: "", label: "— Non assigné —" },
      ...drivers.map((d) => ({
        value: d.userId,
        label: driverOptionLabel(d),
      })),
    ],
    [drivers],
  );

  return (
    <div className="space-y-2">
      <FieldLabel>Chauffeur assigné</FieldLabel>
      <SelectInput value={value} onChange={onChange} options={options} disabled={disabled} />
      <p className="text-xs text-gray-400">Seuls les chauffeurs KYC approuvés avec documents valides (non expirés) sont listés.</p>
    </div>
  );
}
