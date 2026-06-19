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

export function driverOptionLabel(d: AdminDriver) {
  const plate = d.vehicles?.[0]?.plateNumber;
  const id = d.publicId ?? d.userId.slice(0, 8);
  return plate ? `${id} · ${plate}` : id;
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
      <p className="text-xs text-gray-400">Seuls les chauffeurs KYC approuvés sont listés.</p>
    </div>
  );
}
