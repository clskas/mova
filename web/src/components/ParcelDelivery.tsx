"use client";

import { useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";
import { GeoAutocompleteInput } from "./GeoAutocompleteInput";
import { PromoCodeInput, promoPayload } from "./PromoCodeInput";

const WEIGHT_CATEGORIES = [
  { id: "LIGHT", label: "Léger", hint: "< 1 kg" },
  { id: "MEDIUM", label: "Moyen", hint: "1 – 5 kg" },
  { id: "HEAVY", label: "Lourd", hint: "5 – 15 kg" },
  { id: "VERY_HEAVY", label: "Très lourd", hint: "> 15 kg" },
];

type Props = { onBack: () => void; mock: boolean };

export function ParcelDelivery({ onBack, mock }: Props) {
  const [pickup, setPickup] = useState("Ma position");
  const [dropoff, setDropoff] = useState("");
  const [weightCategory, setWeightCategory] = useState("LIGHT");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleEstimate() {
    if (!dropoff) return;
    setLoading(true);
    const data = await apiFetch<{ estimatedPriceCdf?: number }>("/api/deliveries/parcel/estimate", {
      method: "POST",
      body: JSON.stringify({ pickupAddress: pickup, dropoffAddress: dropoff, weightCategory, ...promoPayload(promoCode) }),
    }, { useMock: mock });
    setEstimate(data.estimatedPriceCdf ?? 5000);
    setLoading(false);
  }

  async function handleConfirm() {
    setLoading(true);
    await apiFetch("/api/deliveries/parcel", {
      method: "POST",
      body: JSON.stringify({
        pickupAddress: pickup,
        dropoffAddress: dropoff,
        weightCategory,
        pickupLat: -4.3217,
        pickupLng: 15.3125,
        dropoffLat: -4.35,
        dropoffLng: 15.35,
        ...promoPayload(promoCode),
      }),
    }, { useMock: mock });
    setConfirmed(true);
    setLoading(false);
  }

  if (confirmed) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-4xl mb-2">📦</p>
          <p className="font-semibold">Colis confirmé</p>
          <p className="text-sm text-gray-500 mt-2">Votre livraison est en cours de traitement.</p>
          {mock && <p className="text-xs text-[#FF6B35] mt-2">Mode démo</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <h2 className="text-lg font-semibold">Livraison colis</h2>

      <GeoAutocompleteInput placeholder="Adresse d'enlèvement" value={pickup} onChange={setPickup} />
      <GeoAutocompleteInput
        placeholder="Adresse de livraison"
        value={dropoff}
        onChange={(v) => { setDropoff(v); setEstimate(null); }}
      />

      <p className="text-sm font-medium">Catégorie de poids</p>
      {WEIGHT_CATEGORIES.map((c) => (
        <label key={c.id} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm cursor-pointer">
          <input
            type="radio"
            name="weight"
            checked={weightCategory === c.id}
            onChange={() => { setWeightCategory(c.id); setEstimate(null); }}
          />
          <span className="flex-1">{c.label}</span>
          <span className="text-xs text-gray-400">{c.hint}</span>
        </label>
      ))}

      <PromoCodeInput value={promoCode} onChange={(v) => { setPromoCode(v); setEstimate(null); }} className="mb-2" />
      {estimate != null && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-gray-500 text-sm">Estimation</p>
          <p className="text-2xl font-bold text-[#00D4A1]">{formatCdf(estimate)}</p>
        </div>
      )}

      <button
        onClick={estimate == null ? handleEstimate : handleConfirm}
        disabled={loading || !dropoff}
        className="w-full bg-[#00D4A1] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
      >
        {loading ? "Chargement…" : estimate == null ? "Estimer le prix" : "Confirmer l'envoi"}
      </button>
    </div>
  );
}
