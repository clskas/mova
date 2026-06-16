"use client";

import { useEffect, useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";

type Vehicle = { id: string; name: string; category?: string; pricePerDayCdf?: number; dailyRateCdf?: number };

type Props = { onBack: () => void; mock: boolean };

export function RentalView({ onBack, mock }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [days, setDays] = useState(2);
  const [pickup, setPickup] = useState("Ma position");
  const [phone, setPhone] = useState("+243812345678");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
    apiFetch<{ data?: Vehicle[] }>("/api/rental/vehicles", undefined, { useMock: mock })
      .then((data) => {
        const list = data.data ?? [];
        setVehicles(list);
        if (list.length > 0) setSelectedId(list[0].id);
        if (list.length === 0) setLoadError("Aucun véhicule disponible pour le moment.");
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Erreur catalogue"));
  }, [mock]);

  const pricePerDay = (v: Vehicle) => v.dailyRateCdf ?? v.pricePerDayCdf ?? 0;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);

  const payload = () => ({
    vehicleId: selectedId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    pickupAddress: pickup,
    contactPhone: phone,
  });

  async function handleEstimate() {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ totalPriceCdf?: number }>(
        "/api/rental/estimate",
        { method: "POST", body: JSON.stringify(payload()) },
        { useMock: mock },
      );
      setEstimate(data.totalPriceCdf ?? 170000);
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
      await apiFetch("/api/rental/bookings", { method: "POST", body: JSON.stringify(payload()) }, { useMock: mock });
      setConfirmed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de réserver");
    } finally {
      setLoading(false);
    }
  }

  if (confirmed) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-4xl mb-2">🚗</p>
          <p className="font-semibold">Réservation enregistrée</p>
          <p className="text-sm text-gray-500 mt-2">Vous recevrez une confirmation par SMS.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <h2 className="text-lg font-semibold">Location véhicule</h2>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3">{error}</p>}
      {loadError && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg py-2 px-3">{loadError}</p>}
      {vehicles.length === 0 && !loadError ? (
        <p className="text-sm text-gray-500">Chargement du catalogue…</p>
      ) : (
        vehicles.map((v) => (
          <label key={v.id} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm cursor-pointer">
            <input type="radio" name="vehicle" checked={selectedId === v.id} onChange={() => { setSelectedId(v.id); setEstimate(null); }} />
            <span className="flex-1 font-medium">{v.name}</span>
            <span className="text-sm text-[#6C63FF]">{formatCdf(pricePerDay(v))}/j</span>
          </label>
        ))
      )}
      <label className="block text-sm font-medium">Durée (jours)</label>
      <input type="number" min={1} max={30} className="w-full rounded-xl border-0 bg-white p-3 shadow-sm" value={days} onChange={(e) => { setDays(Number(e.target.value)); setEstimate(null); }} />
      <input className="w-full rounded-xl border-0 bg-white p-3 shadow-sm" placeholder="Lieu de prise en charge" value={pickup} onChange={(e) => setPickup(e.target.value)} />
      <input className="w-full rounded-xl border-0 bg-white p-3 shadow-sm" placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      {estimate != null && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-gray-500 text-sm">Total estimé ({days} j)</p>
          <p className="text-2xl font-bold text-[#6C63FF]">{formatCdf(estimate)}</p>
        </div>
      )}
      <button
        type="button"
        onClick={estimate == null ? handleEstimate : handleConfirm}
        disabled={loading || !selectedId}
        className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
      >
        {loading ? "Chargement…" : estimate == null ? "Estimer la location" : "Réserver"}
      </button>
    </div>
  );
}
