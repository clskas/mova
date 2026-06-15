"use client";

import { useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";

type Props = { onBack: () => void; mock: boolean };

const DEFAULT_COORDS = {
  pickupLat: -4.3217,
  pickupLng: 15.3125,
  dropoffLat: -4.35,
  dropoffLng: 15.35,
};

export function ExpressDelivery({ onBack, mock }: Props) {
  const [pickup, setPickup] = useState("Ma position");
  const [dropoff, setDropoff] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  const payload = () => ({
    pickupAddress: pickup,
    dropoffAddress: dropoff,
    weightCategory: "LIGHT",
    ...DEFAULT_COORDS,
  });

  async function handleEstimate() {
    if (!dropoff.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ estimatedPriceCdf?: number }>(
        "/api/express/estimate",
        { method: "POST", body: JSON.stringify(payload()) },
        { useMock: mock },
      );
      setEstimate(data.estimatedPriceCdf ?? 7500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'estimation");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ delivery?: { id?: string } }>(
        "/api/express",
        { method: "POST", body: JSON.stringify(payload()) },
        { useMock: mock },
      );
      setTrackingId(data.delivery?.id ?? null);
      setConfirmed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de créer la livraison");
    } finally {
      setLoading(false);
    }
  }

  if (confirmed) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-4xl mb-2">⚡</p>
          <p className="font-semibold">Express confirmé</p>
          {trackingId && <p className="text-xs text-gray-400 mt-1">Réf. {trackingId}</p>}
          <p className="text-sm text-gray-500 mt-2">Livraison prioritaire en cours de traitement.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <h2 className="text-lg font-semibold">Livraison express</h2>
      <p className="text-sm text-gray-500">Petit colis, livraison prioritaire</p>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3">{error}</p>}
      <input
        className="w-full rounded-xl border-0 bg-white p-3 shadow-sm"
        placeholder="Adresse d'enlèvement"
        value={pickup}
        onChange={(e) => setPickup(e.target.value)}
      />
      <input
        className="w-full rounded-xl border-0 bg-white p-3 shadow-sm"
        placeholder="Adresse de livraison"
        value={dropoff}
        onChange={(e) => { setDropoff(e.target.value); setEstimate(null); }}
      />
      {estimate != null && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-gray-500 text-sm">Estimation express</p>
          <p className="text-2xl font-bold text-[#FF6B35]">{formatCdf(estimate)}</p>
        </div>
      )}
      <button
        type="button"
        onClick={estimate == null ? handleEstimate : handleConfirm}
        disabled={loading || !dropoff.trim()}
        className="w-full bg-[#FF6B35] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
      >
        {loading ? "Chargement…" : estimate == null ? "Estimer le prix" : "Confirmer l'express"}
      </button>
    </div>
  );
}
