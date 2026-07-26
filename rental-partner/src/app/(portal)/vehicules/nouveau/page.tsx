"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  EMPTY_VEHICLE_FORM,
  VehicleForm,
  vehicleFormPayload,
  type VehicleFormState,
} from "@/components/VehicleForm";
import { fetchVehicle, submitVehicle, updateVehicle, type PartnerVehicle } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";

function vehicleToForm(v: PartnerVehicle): VehicleFormState {
  return {
    name: v.name ?? "",
    make: v.make ?? "",
    model: v.model ?? "",
    category: v.category ?? "ECONOMY",
    transmission: v.transmission ?? "MANUAL",
    city: v.city ?? "Kinshasa",
    seats: String(v.seats ?? 5),
    dailyRateCdf: String(v.dailyRateCdf ?? ""),
    hourlyRateCdf: v.hourlyRateCdf != null ? String(v.hourlyRateCdf) : "",
    depositCdf: String(v.depositCdf ?? 100000),
    ownerName: v.ownerName ?? "",
    ownerContactPhone: v.ownerContactPhone ?? "",
    features: (v.features ?? []).join(", "),
    imageUrl: v.imageUrl ?? null,
  };
}

function VehicleFormPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEdit = Boolean(editId);

  const [form, setForm] = useState<VehicleFormState>(EMPTY_VEHICLE_FORM);
  const [isApproved, setIsApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!isEdit || !editId) {
          setLoading(false);
          return;
        }
        const vehicle = await fetchVehicle(editId);
        if (cancelled) return;
        if (!vehicle) {
          setError("Véhicule introuvable");
          setLoading(false);
          return;
        }
        setIsApproved(vehicle.approvalStatus === "APPROVED");
        setForm(vehicleToForm(vehicle));
      } catch (e) {
        if (!cancelled) setError(toUserErrorMessage(e, "Erreur chargement"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, isEdit]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = vehicleFormPayload(form);
      if (isEdit && editId) {
        await updateVehicle(editId, payload);
      } else {
        await submitVehicle(payload);
      }
      router.replace("/vehicules");
    } catch (err) {
      setError(toUserErrorMessage(err, "Erreur envoi"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/vehicules" className="text-sm text-indigo-600 hover:underline">
          ← Mes véhicules
        </Link>
        <h2 className="text-xl font-semibold mt-2">{isEdit ? "Modifier le véhicule" : "Inscrire un véhicule"}</h2>
        <p className="text-sm text-gray-500">
          {isEdit && isApproved
            ? "Véhicule publié — vous pouvez ajuster tarifs, photo et équipements sans nouvelle validation."
            : isEdit
              ? "Après modification, le dossier repasse en validation SENGA."
              : "Votre annonce sera visible après validation par l'équipe SENGA (catalogue admin)."}
        </p>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement…</p>
      ) : error && !form.name && isEdit ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
      ) : (
        <VehicleForm
          form={form}
          onChange={setForm}
          onSubmit={handleSubmit}
          saving={saving}
          error={error}
          submitLabel={
            isEdit && isApproved
              ? "Enregistrer les modifications"
              : isEdit
                ? "Enregistrer et resoumettre"
                : "Soumettre pour validation SENGA"
          }
          onPhotoError={setError}
          lockIdentityFields={isApproved}
        />
      )}
    </div>
  );
}

export default function NewVehiclePage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Chargement…</p>}>
      <VehicleFormPageInner />
    </Suspense>
  );
}
