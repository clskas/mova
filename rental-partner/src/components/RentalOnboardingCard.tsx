"use client";

import { useEffect, useState } from "react";
import { GpsCoordButton } from "@/components/GpsCoordButton";
import { completeRentalProfile, fetchProfile } from "@/lib/api";
import { MOVA_CITIES } from "@/lib/mova-cities";
import { toUserErrorMessage } from "@/lib/user-messages";

type RentalOnboardingCardProps = {
  onComplete: () => void;
};

function parseCoord(value: string): number | null {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function RentalOnboardingCard({ onComplete }: RentalOnboardingCardProps) {
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("Kinshasa");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((p) => {
        if (cancelled) return;
        if (p.businessName && p.businessName !== "Ma location") setBusinessName(p.businessName);
        else if (p.name && p.name !== "Ma location") setBusinessName(p.name);
        if (p.city && p.city !== "À préciser") setCity(p.city);
        if (p.address && p.address !== "Kinshasa — à compléter") setAddress(p.address);
        if (p.lat != null) setLat(String(p.lat));
        if (p.lng != null) setLng(String(p.lng));
      })
      .catch((e) => {
        if (!cancelled) setError(toUserErrorMessage(e, "Impossible de charger votre activité."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const latNum = parseCoord(lat);
      const lngNum = parseCoord(lng);
      if (latNum == null || lngNum == null) {
        throw new Error("Renseignez la latitude et la longitude (GPS).");
      }
      const result = await completeRentalProfile({
        businessName: businessName.trim(),
        city: city.trim(),
        address: address.trim(),
        lat: latNum,
        lng: lngNum,
      });
      if (result.needsProfileSetup) {
        throw new Error("Complétez toutes les informations de votre activité de location.");
      }
      onComplete();
    } catch (err) {
      setError(toUserErrorMessage(err, "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Complétez les informations de votre activité</h2>
        <p className="mt-2 text-sm text-gray-500">
          Ces informations lient automatiquement votre compte à votre activité de location. Ensuite, vous
          pourrez compléter votre dossier KYC dans <span className="font-medium">Mon dossier</span>.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="text-gray-600">Nom de l&apos;agence / activité</span>
            <input
              required
              className="mt-1 w-full rounded-xl border p-3"
              placeholder="Ex. SENGA Fleet Kinshasa"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Ville principale</span>
            <select
              required
              className="mt-1 w-full rounded-xl border p-3 bg-white"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              {MOVA_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Adresse</span>
            <input
              required
              className="mt-1 w-full rounded-xl border p-3"
              placeholder="Ex. Gombe, Kinshasa"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-gray-600">Latitude</span>
              <input
                required
                className="mt-1 w-full rounded-xl border p-3 font-mono text-sm"
                placeholder="-4.3217"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Longitude</span>
              <input
                required
                className="mt-1 w-full rounded-xl border p-3 font-mono text-sm"
                placeholder="15.3125"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </label>
          </div>
          <GpsCoordButton
            onCoords={(nextLat, nextLng) => {
              setLat(nextLat);
              setLng(nextLng);
              setError(null);
            }}
            onError={setError}
          />
          <p className="text-xs text-gray-400">
            Les clients voient les véhicules proches de leur ville. Une position précise de votre siège
            améliore votre visibilité.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading || saving}
        className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-60"
      >
        {saving ? "Enregistrement…" : "Continuer vers Mon dossier"}
      </button>
    </form>
  );
}
