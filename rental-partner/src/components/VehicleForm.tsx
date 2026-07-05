"use client";

import { VehiclePhotoUpload } from "@/components/VehiclePhotoUpload";
import { MOVA_CITIES } from "@/lib/mova-cities";

export type VehicleFormState = {
  name: string;
  make: string;
  model: string;
  category: string;
  transmission: string;
  city: string;
  seats: string;
  dailyRateCdf: string;
  hourlyRateCdf: string;
  depositCdf: string;
  ownerName: string;
  ownerContactPhone: string;
  features: string;
  imageUrl: string | null;
};

export const EMPTY_VEHICLE_FORM: VehicleFormState = {
  name: "",
  make: "",
  model: "",
  category: "ECONOMY",
  transmission: "MANUAL",
  city: "Kinshasa",
  seats: "5",
  dailyRateCdf: "",
  hourlyRateCdf: "",
  depositCdf: "100000",
  ownerName: "",
  ownerContactPhone: "",
  features: "",
  imageUrl: null,
};

const CATEGORIES = [
  { value: "ECONOMY", label: "Économique" },
  { value: "SUV", label: "SUV" },
  { value: "PREMIUM", label: "Premium" },
  { value: "VAN", label: "Utilitaire" },
];

const inputClass = "mt-1 w-full rounded-xl border border-gray-200 p-3 text-sm";

type Props = {
  form: VehicleFormState;
  onChange: (form: VehicleFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
  submitLabel: string;
  onPhotoError?: (msg: string) => void;
  lockIdentityFields?: boolean;
};

export function VehicleForm({ form, onChange, onSubmit, saving, error, submitLabel, onPhotoError, lockIdentityFields }: Props) {
  const locked = lockIdentityFields === true;
  const lockedClass = locked ? `${inputClass} bg-gray-50 text-gray-500 cursor-not-allowed` : inputClass;
  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
      {locked && (
        <p className="text-sm text-indigo-700 bg-indigo-50 rounded-xl px-3 py-2">
          Véhicule publié : seuls tarifs, photo, équipements et caution sont modifiables.
        </p>
      )}
      <label className="block text-sm">
        <span className="text-gray-600">Nom affiché *</span>
        <input
          required
          readOnly={locked}
          className={locked ? lockedClass : inputClass}
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="Ex. Toyota RAV4 2022"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-gray-600">Marque</span>
          <input readOnly={locked} className={locked ? lockedClass : inputClass} value={form.make} onChange={(e) => onChange({ ...form, make: e.target.value })} />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Modèle</span>
          <input readOnly={locked} className={locked ? lockedClass : inputClass} value={form.model} onChange={(e) => onChange({ ...form, model: e.target.value })} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-gray-600">Catégorie *</span>
          <select
            disabled={locked}
            className={locked ? lockedClass : inputClass}
            value={form.category}
            onChange={(e) => onChange({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Transmission</span>
          <select
            disabled={locked}
            className={locked ? lockedClass : inputClass}
            value={form.transmission}
            onChange={(e) => onChange({ ...form, transmission: e.target.value })}
          >
            <option value="MANUAL">Manuelle</option>
            <option value="AUTO">Automatique</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-gray-600">Ville</span>
          <select disabled={locked} className={locked ? lockedClass : inputClass} value={form.city} onChange={(e) => onChange({ ...form, city: e.target.value })}>
            {MOVA_CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Places</span>
          <input readOnly={locked} className={locked ? lockedClass : inputClass} value={form.seats} onChange={(e) => onChange({ ...form, seats: e.target.value })} />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Tarif / jour (FC) *</span>
          <input
            required
            type="number"
            min={1}
            className={inputClass}
            value={form.dailyRateCdf}
            onChange={(e) => onChange({ ...form, dailyRateCdf: e.target.value })}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-gray-600">Tarif / heure (FC)</span>
        <input
          type="number"
          min={1}
          className={inputClass}
          value={form.hourlyRateCdf}
          onChange={(e) => onChange({ ...form, hourlyRateCdf: e.target.value })}
          placeholder="Optionnel — calculé depuis le tarif jour si vide"
        />
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">Caution (FC)</span>
        <input className={inputClass} value={form.depositCdf} onChange={(e) => onChange({ ...form, depositCdf: e.target.value })} />
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">Équipements (virgules)</span>
        <input
          className={inputClass}
          value={form.features}
          onChange={(e) => onChange({ ...form, features: e.target.value })}
          placeholder="Climatisation, GPS, Diesel"
        />
      </label>
      <VehiclePhotoUpload value={form.imageUrl} onChange={(url) => onChange({ ...form, imageUrl: url })} onError={onPhotoError} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-60"
      >
        {saving ? "Enregistrement…" : submitLabel}
      </button>
    </form>
  );
}

export function vehicleFormPayload(form: VehicleFormState) {
  const features = form.features
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  return {
    name: form.name.trim(),
    make: form.make.trim() || undefined,
    model: form.model.trim() || undefined,
    category: form.category,
    transmission: form.transmission,
    city: form.city.trim() || "Kinshasa",
    seats: Number(form.seats) || 5,
    dailyRateCdf: Number(form.dailyRateCdf),
    ...(form.hourlyRateCdf.trim() ? { hourlyRateCdf: Number(form.hourlyRateCdf) } : {}),
    depositCdf: Number(form.depositCdf) || 100000,
    ownerName: form.ownerName.trim() || undefined,
    ownerContactPhone: form.ownerContactPhone.trim() || undefined,
    features,
    imageUrl: form.imageUrl ?? undefined,
  };
}
