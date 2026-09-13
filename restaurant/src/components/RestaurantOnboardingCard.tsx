"use client";

import { useEffect, useState } from "react";
import { GpsCoordButton } from "@/components/GpsCoordButton";
import { completeRestaurantProfile, fetchProfile } from "@/lib/api";
import {
  COMMERCE_TYPE_LABELS_FR,
  parseCommerceType,
  type CommerceType,
} from "@/lib/commerce-type";
import { toUserErrorMessage } from "@/lib/user-messages";

const COMMERCE_OPTIONS: { value: CommerceType; hint: string }[] = [
  { value: "RESTAURANT", hint: "Menus, plats, options et suppléments" },
  { value: "SUPERMARKET", hint: "Catalogue, stock et catégories" },
  { value: "PHARMACY", hint: "Produits de santé et restrictions" },
  { value: "BOUTIQUE", hint: "Mode, accessoires, cadeaux, etc." },
];

type RestaurantOnboardingCardProps = {
  onComplete: () => void;
};

function parseCoord(value: string): number | null {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function RestaurantOnboardingCard({ onComplete }: RestaurantOnboardingCardProps) {
  const [commerceType, setCommerceType] = useState<CommerceType>("RESTAURANT");
  const [name, setName] = useState("");
  const [cuisine, setCuisine] = useState("Congolaise");
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
        setCommerceType(parseCommerceType(p.commerceType));
        if (p.name && p.name !== "Mon restaurant") setName(p.name);
        if (p.cuisine && p.cuisine !== "À préciser") setCuisine(p.cuisine);
        if (p.address && p.address !== "Kinshasa — à compléter") setAddress(p.address);
        if (p.lat != null) setLat(String(p.lat));
        if (p.lng != null) setLng(String(p.lng));
      })
      .catch((e) => {
        if (!cancelled) setError(toUserErrorMessage(e, "Impossible de charger votre magasin."));
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
      const result = await completeRestaurantProfile({
        name: name.trim(),
        cuisine: cuisine.trim(),
        address: address.trim(),
        lat: latNum,
        lng: lngNum,
        commerceType,
      });
      if (result.needsProfileSetup) {
        throw new Error("Complétez toutes les informations de votre établissement.");
      }
      onComplete();
    } catch (err) {
      setError(toUserErrorMessage(err, "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  }

  const specialtyLabel = commerceType === "RESTAURANT" ? "Cuisine / spécialité" : "Spécialité / rayon";
  const nameLabel =
    commerceType === "RESTAURANT"
      ? "Nom du restaurant"
      : commerceType === "PHARMACY"
        ? "Nom de la pharmacie"
        : commerceType === "SUPERMARKET"
          ? "Nom du supermarché"
          : "Nom de la boutique";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Bienvenue sur SENGA Business</h2>
        <p className="mt-2 text-sm text-gray-500">
          Choisissez d’abord votre type de commerce — le portail s’adapte (menu, catalogue, stock,
          restrictions). Ensuite, complétez votre dossier KYC dans{" "}
          <span className="font-medium">Mon dossier</span>.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm font-medium text-gray-700">Type de commerce</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {COMMERCE_OPTIONS.map((opt) => {
                const selected = commerceType === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`cursor-pointer rounded-xl border p-3 transition ${
                      selected
                        ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300"
                        : "border-gray-200 hover:border-orange-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="commerceType"
                      className="sr-only"
                      checked={selected}
                      onChange={() => setCommerceType(opt.value)}
                    />
                    <span className="block text-sm font-semibold text-gray-900">
                      {COMMERCE_TYPE_LABELS_FR[opt.value]}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">{opt.hint}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="block text-sm">
            <span className="text-gray-600">{nameLabel}</span>
            <input
              required
              className="mt-1 w-full rounded-xl border p-3"
              placeholder="Ex. Chez Flore"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">{specialtyLabel}</span>
            <input
              required
              className="mt-1 w-full rounded-xl border p-3"
              placeholder={commerceType === "RESTAURANT" ? "Ex. Congolaise" : "Ex. Épicerie, Mode…"}
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
            />
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
            Les clients voient les commerces proches de leur adresse de livraison. Une position précise
            améliore votre visibilité.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading || saving}
        className="w-full py-3 rounded-xl bg-[#FF6B35] text-white font-medium disabled:opacity-60"
      >
        {saving ? "Enregistrement…" : "Continuer vers Mon dossier"}
      </button>
    </form>
  );
}
