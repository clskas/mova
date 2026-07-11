"use client";

import { useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";
import { GeoAutocompleteInput } from "./GeoAutocompleteInput";

const VOLUMES = [
  { id: "STUDIO", label: "Studio", m3: 3 },
  { id: "APARTMENT", label: "Appartement", m3: 10 },
  { id: "HOUSE", label: "Maison", m3: 22 },
  { id: "OFFICE", label: "Bureau", m3: 15 },
];

type Props = { onBack: () => void; mock: boolean };

export function MovingView({ onBack, mock }: Props) {
  const [from, setFrom] = useState("Bandal, Kinshasa");
  const [to, setTo] = useState("");
  const [volume, setVolume] = useState("APARTMENT");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const volumeM3 = VOLUMES.find((v) => v.id === volume)?.m3 ?? 10;

  const payload = () => ({
    pickupAddress: from,
    dropoffAddress: to,
    pickupLat: -4.35,
    pickupLng: 15.30,
    dropoffLat: -4.32,
    dropoffLng: 15.35,
    volumeM3,
  });

  async function handleEstimate() {
    if (!to.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ estimatedPriceCdf?: number }>(
        "/api/moving/estimate",
        { method: "POST", body: JSON.stringify(payload()) },
        { useMock: mock },
      );
      setEstimate(data.estimatedPriceCdf ?? 45000);
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
      await apiFetch("/api/moving", { method: "POST", body: JSON.stringify(payload()) }, { useMock: mock });
      setConfirmed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de créer la demande");
    } finally {
      setLoading(false);
    }
  }

  if (confirmed) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-4xl mb-2">🚚</p>
          <p className="font-semibold">Déménagement enregistré</p>
          <p className="text-sm text-gray-500 mt-2">Notre équipe vous contactera pour confirmer le créneau.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <h2 className="text-lg font-semibold">Déménagement</h2>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3">{error}</p>}
      <GeoAutocompleteInput placeholder="Adresse de départ" value={from} onChange={setFrom} />
      <GeoAutocompleteInput placeholder="Adresse d'arrivée" value={to} onChange={(v) => { setTo(v); setEstimate(null); }} />
      <p className="text-sm font-medium">Volume estimé</p>
      {VOLUMES.map((v) => (
        <label key={v.id} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm cursor-pointer">
          <input type="radio" name="volume" checked={volume === v.id} onChange={() => { setVolume(v.id); setEstimate(null); }} />
          <span className="flex-1">{v.label}</span>
          <span className="text-xs text-gray-400">~{v.m3} m³</span>
        </label>
      ))}
      {estimate != null && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-gray-500 text-sm">Estimation</p>
          <p className="text-2xl font-bold text-[#6C63FF]">{formatCdf(estimate)}</p>
        </div>
      )}
      <button
        type="button"
        onClick={estimate == null ? handleEstimate : handleConfirm}
        disabled={loading || !to.trim()}
        className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
      >
        {loading ? "Chargement…" : estimate == null ? "Estimer le déménagement" : "Demander un devis"}
      </button>
    </div>
  );
}
