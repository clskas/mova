"use client";

import type { AdminDriver } from "@/lib/api";
import { driverDisplayName } from "@/components/AssignDriverSelect";
import { resolveMediaUrl } from "@/components/VehiclePhotoUpload";

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  MOTO_TAXI: "Moto-taxi",
  STANDARD: "Standard",
  COMFORT: "Confort",
  VIP: "VIP",
  UTILITAIRE: "Utilitaire",
  CAMION: "Camion",
};

export function activeDriverVehicle(driver?: AdminDriver | null) {
  if (!driver?.vehicles?.length) return null;
  return driver.vehicles.find((v) => v.isActive !== false) ?? driver.vehicles[0];
}

type Props = {
  driver?: AdminDriver | null;
  title?: string;
  compact?: boolean;
};

export function DriverVehiclePreview({ driver, title = "Véhicule du chauffeur", compact }: Props) {
  const vehicle = activeDriverVehicle(driver);
  if (!vehicle) {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Aucun véhicule enregistré sur le profil chauffeur.
      </p>
    );
  }

  const photo = resolveMediaUrl(vehicle.imageUrl);
  const typeLabel = VEHICLE_TYPE_LABELS[vehicle.type] ?? vehicle.type;
  const driverName = driverDisplayName(driver ?? {});
  const details = [typeLabel, vehicle.plateNumber, vehicle.make, vehicle.model].filter(Boolean).join(" · ");

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600">
        {photo ? <img src={photo} alt="" className="w-10 h-8 object-cover rounded border shrink-0" /> : null}
        <span>
          {driverName ? `${driverName} — ` : ""}
          {details}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <div className="flex gap-3 items-start">
        {photo ? (
          <img src={photo} alt="Véhicule" className="w-24 h-18 object-cover rounded-lg border shrink-0" />
        ) : (
          <div className="w-24 h-16 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-[10px] text-gray-400 text-center px-1">
            Photo non fournie
          </div>
        )}
        <div className="text-sm space-y-1">
          {driverName && <p className="font-semibold text-[#1A1A2E]">{driverName}</p>}
          <p className="font-medium">{details}</p>
          {driver?.publicId && <p className="text-xs text-gray-500">ID MOVA {driver.publicId}</p>}
        </div>
      </div>
    </div>
  );
}
