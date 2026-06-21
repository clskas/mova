"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PortalShell } from "@/components/PortalShell";
import {
  EMPTY_VEHICLE_FORM,
  VehicleForm,
  vehicleFormPayload,
  type VehicleFormState,
} from "@/components/VehicleForm";
import { fetchProfile, fetchVehicles, submitVehicle, updateVehicle, type PartnerVehicle } from "@/lib/api";

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
  const [partnerName, setPartnerName] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchProfile();
        if (cancelled) return;
        setPartnerName(profile.name);
        if (!isEdit) {
          setForm((f) => ({
            ...f,
            ownerName: profile.name ?? f.ownerName,
            ownerContactPhone: profile.phone ?? f.ownerContactPhone,
          }));
          setLoading(false);
          return;
        }
        const list = await fetchVehicles();
        const vehicle = list.find((v) => v.id === editId);
        if (!vehicle) {
          setError("Véhicule introuvable");
          setLoading(false);
          return;
        }
        if (vehicle.approvalStatus === "APPROVED") {
          setError("Véhicule déjà publié — contactez MOVA pour modifier.");
          setLoading(false);
          return;
        }
        setForm(vehicleToForm(vehicle));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur chargement");
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
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur envoi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalShell partnerName={partnerName}>
      <div className="space-y-6">
        <div>
          <Link href="/" className="text-sm text-indigo-600 hover:underline">
            ← Mes véhicules
          </Link>
          <h2 className="text-xl font-semibold mt-2">{isEdit ? "Modifier le véhicule" : "Inscrire un véhicule"}</h2>
          <p className="text-sm text-gray-500">
            {isEdit
              ? "Après modification, le dossier repasse en validation MOVA."
              : "Votre annonce sera visible après validation par l'équipe MOVA (catalogue admin)."}
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
            submitLabel={isEdit ? "Enregistrer et resoumettre" : "Soumettre pour validation MOVA"}
            onPhotoError={setError}
          />
        )}
      </div>
    </PortalShell>
  );
}

export default function NewVehiclePage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-500">Chargement…</p>}>
      <VehicleFormPageInner />
    </Suspense>
  );
}
