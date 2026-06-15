"use client";

import { useEffect, useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";

type ScheduledRide = {
  id: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  scheduledAt?: string;
  status?: string;
  priceCdf?: number;
  estimatedPriceCdf?: number;
};

type Props = { onBack: () => void; mock: boolean };

export function ScheduledRidesView({ onBack, mock }: Props) {
  const [rides, setRides] = useState<ScheduledRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [destination, setDestination] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadUpcoming() {
    setLoading(true);
    try {
      const res = await apiFetch<{ data?: ScheduledRide[] }>("/api/rides/scheduled");
      setRides(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUpcoming();
    const dt = new Date(Date.now() + 2 * 3600000);
    setScheduledAt(dt.toISOString().slice(0, 16));
  }, []);

  async function handleEstimate() {
    if (!destination.trim()) return;
    setBooking(true);
    setError(null);
    try {
      const data = await apiFetch<{ estimatedPriceCdf?: number }>("/api/rides/scheduled/estimate", {
        method: "POST",
        body: JSON.stringify({
          pickupLat: -4.3217,
          pickupLng: 15.3125,
          dropoffLat: -4.35,
          dropoffLng: 15.35,
          pickupAddress: "Ma position",
          dropoffAddress: destination,
          vehicleType: "STANDARD",
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      });
      setEstimate(data.estimatedPriceCdf ?? 9500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Estimation impossible");
    } finally {
      setBooking(false);
    }
  }

  async function handleBook() {
    setBooking(true);
    setError(null);
    try {
      await apiFetch("/api/rides/scheduled", {
        method: "POST",
        body: JSON.stringify({
          pickupLat: -4.3217,
          pickupLng: 15.3125,
          dropoffLat: -4.35,
          dropoffLng: 15.35,
          pickupAddress: "Ma position",
          dropoffAddress: destination,
          vehicleType: "STANDARD",
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      });
      setDestination("");
      setEstimate(null);
      await loadUpcoming();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Réservation impossible");
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <h2 className="text-lg font-semibold">Courses planifiées</h2>
      {mock && <p className="text-xs text-[#FF6B35] bg-orange-50 rounded-lg py-2 px-3">Mode démo</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <input
          className="w-full rounded-xl border-0 bg-gray-50 p-3"
          placeholder="Destination"
          value={destination}
          onChange={(e) => { setDestination(e.target.value); setEstimate(null); }}
        />
        <input
          type="datetime-local"
          className="w-full rounded-xl border-0 bg-gray-50 p-3"
          value={scheduledAt}
          onChange={(e) => { setScheduledAt(e.target.value); setEstimate(null); }}
        />
        {estimate == null ? (
          <button type="button" onClick={handleEstimate} disabled={booking} className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-medium">
            Estimer
          </button>
        ) : (
          <>
            <p className="text-center font-bold text-[#00D4A1]">{formatCdf(estimate)}</p>
            <button type="button" onClick={handleBook} disabled={booking} className="w-full bg-[#00D4A1] text-white rounded-xl py-3 font-medium">
              Réserver
            </button>
          </>
        )}
      </div>

      <div>
        <p className="font-medium mb-2">À venir</p>
        {loading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : rides.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune réservation</p>
        ) : (
          <div className="space-y-2">
            {rides.map((r) => (
              <div key={r.id} className="bg-white rounded-xl p-3 shadow-sm">
                <p className="font-medium text-sm">{r.pickupAddress} → {r.dropoffAddress}</p>
                <p className="text-xs text-gray-500">
                  {r.scheduledAt ? new Date(r.scheduledAt).toLocaleString("fr-CD") : ""} · {r.status}
                </p>
                <p className="text-[#6C63FF] font-bold mt-1">{formatCdf(r.priceCdf ?? r.estimatedPriceCdf ?? 0)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
