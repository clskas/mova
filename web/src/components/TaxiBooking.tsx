"use client";

import { useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";
import { PromoCodeInput, promoPayload } from "./PromoCodeInput";

const VEHICLES = [
  { id: "MOTO_TAXI", label: "Moto-taxi", icon: "🏍️" },
  { id: "STANDARD", label: "Standard", icon: "🚗" },
  { id: "COMFORT", label: "Confort", icon: "✨" },
];

type Props = { onBack: () => void; mock: boolean };

export function TaxiBooking({ onBack, mock }: Props) {
  const [destination, setDestination] = useState("");
  const [vehicleType, setVehicleType] = useState("MOTO_TAXI");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleEstimate() {
    if (!destination) return;
    setLoading(true);
    const data = await apiFetch<{ priceCdf?: number; estimatedFareCdf?: number }>("/api/rides/estimate", {
      method: "POST",
      body: JSON.stringify({
        pickupLat: -4.3217,
        pickupLng: 15.3125,
        dropoffLat: -4.35,
        dropoffLng: 15.35,
        vehicleType,
        ...promoPayload(promoCode),
      }),
    }, { useMock: mock });
    setEstimate(data.priceCdf ?? data.estimatedFareCdf ?? 8500);
    setLoading(false);
  }

  async function handleConfirm() {
    setLoading(true);
    await apiFetch("/api/rides", {
      method: "POST",
      body: JSON.stringify({
        pickupAddress: "Ma position",
        dropoffAddress: destination,
        pickupLat: -4.3217,
        pickupLng: 15.3125,
        dropoffLat: -4.35,
        dropoffLng: 15.35,
        vehicleType,
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
          <p className="text-4xl mb-2">✅</p>
          <p className="font-semibold">Course confirmée</p>
          <p className="text-sm text-gray-500 mt-2">Un chauffeur sera assigné sous peu.</p>
          {mock && <p className="text-xs text-[#FF6B35] mt-2">Mode démo</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <h2 className="text-lg font-semibold">Taxi / Moto-taxi</h2>

      <label className="block text-sm font-medium">Destination</label>
      <input
        className="w-full rounded-xl border-0 bg-white p-3 shadow-sm"
        placeholder="Ex: Gombe, Limete, Masina…"
        value={destination}
        onChange={(e) => { setDestination(e.target.value); setEstimate(null); }}
      />

      <p className="text-sm font-medium">Type de véhicule</p>
      {VEHICLES.map((v) => (
        <label key={v.id} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm cursor-pointer">
          <input
            type="radio"
            name="vehicle"
            checked={vehicleType === v.id}
            onChange={() => { setVehicleType(v.id); setEstimate(null); }}
          />
          <span>{v.icon} {v.label}</span>
        </label>
      ))}

      <PromoCodeInput value={promoCode} onChange={(v) => { setPromoCode(v); setEstimate(null); }} />

      {estimate != null && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-gray-500 text-sm">Estimation</p>
          <p className="text-2xl font-bold text-[#6C63FF]">{formatCdf(estimate)}</p>
        </div>
      )}

      <button
        onClick={estimate == null ? handleEstimate : handleConfirm}
        disabled={loading || !destination}
        className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
      >
        {loading ? "Chargement…" : estimate == null ? "Estimer le prix" : "Confirmer la course"}
      </button>
    </div>
  );
}
