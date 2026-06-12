"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Ride = {
  id: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  priceCdf?: number;
  status?: string;
};

export default function Home() {
  const [tab, setTab] = useState<"book" | "history">("book");
  const [destination, setDestination] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(false);
  const [mock, setMock] = useState(false);

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab]);

  async function loadHistory() {
    try {
      const data = await apiFetch<Ride[]>("/api/rides/history?role=passenger");
      setRides(Array.isArray(data) ? data : []);
      localStorage.setItem("mova_history", JSON.stringify(data));
    } catch {
      const cached = localStorage.getItem("mova_history");
      if (cached) setRides(JSON.parse(cached));
    }
  }

  async function handleEstimate() {
    if (!destination) return;
    setLoading(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
      const q = `pickupLat=-4.3217&pickupLng=15.3125&dropoffLat=-4.35&dropoffLng=15.35&vehicleType=MOTO_TAXI`;
      const res = await fetch(`${base}/api/rides/estimate?${q}`);
      if (!res.ok) throw new Error("offline");
      const data = await res.json();
      setEstimate(data.priceCdf ?? data.estimatedFareCdf ?? 8500);
      setMock(false);
    } catch {
      setEstimate(8500);
      setMock(true);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col">
      <header className="bg-[#1A1A2E] text-white p-4 text-center">
        <h1 className="text-xl font-semibold">MOVA — RDC</h1>
        <p className="text-sm opacity-80">Mobilité urbaine partout en RDC — Kinshasa par défaut</p>
      </header>

      <nav className="flex border-b bg-white">
        {(["book", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium ${
              tab === t ? "text-[#6C63FF] border-b-2 border-[#6C63FF]" : "text-gray-500"
            }`}
          >
            {t === "book" ? "Réserver" : "Historique"}
          </button>
        ))}
      </nav>

      <main className="flex-1 p-4 space-y-4">
        {mock && (
          <p className="text-center text-sm text-[#FF6B35] bg-orange-50 rounded-lg py-2">
            Mode démo — backend indisponible
          </p>
        )}

        {tab === "book" ? (
          <>
            <label className="block text-sm font-medium">Destination</label>
            <input
              className="w-full rounded-xl border-0 bg-white p-3 shadow-sm"
              placeholder="Ex: Gombe, Limete, Masina…"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
            {estimate != null && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-gray-500 text-sm">Estimation</p>
                <p className="text-2xl font-bold text-[#6C63FF]">
                  {estimate.toLocaleString("fr-CD")} FC
                </p>
              </div>
            )}
            <button
              onClick={handleEstimate}
              disabled={loading || !destination}
              className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
            >
              {loading ? "Calcul…" : estimate ? "Confirmer la course" : "Estimer le prix"}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            {rides.length === 0 ? (
              <p className="text-center text-gray-500">Aucune course</p>
            ) : (
              rides.map((r) => (
                <div key={r.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <p className="font-medium truncate">
                    {r.pickupAddress} → {r.dropoffAddress}
                  </p>
                  <p className="text-[#6C63FF]">{(r.priceCdf ?? 0).toLocaleString("fr-CD")} FC</p>
                  <p className="text-xs text-gray-400">{r.status}</p>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
