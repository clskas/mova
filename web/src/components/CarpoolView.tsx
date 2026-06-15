"use client";

import { useEffect, useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";

type CarpoolTrip = {
  id: string;
  fromAddress?: string;
  toAddress?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  driverName?: string;
  availableSeats?: number;
  seatsAvailable?: number;
  pricePerSeatCdf?: number;
  departureAt?: string;
  passengerCount?: number;
};

type Props = { onBack: () => void; mock: boolean };

export function CarpoolView({ onBack, mock }: Props) {
  const [trips, setTrips] = useState<CarpoolTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("Ma position");
  const [to, setTo] = useState("");
  const [seats, setSeats] = useState("3");
  const [departureAt, setDepartureAt] = useState("");
  const [estimate, setEstimate] = useState<{ total?: number; perSeat?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"search" | "create">("search");

  const pickupLat = -4.3217;
  const pickupLng = 15.3125;
  const dropoffLat = -4.35;
  const dropoffLng = 15.35;

  function normalizeTrip(t: CarpoolTrip): CarpoolTrip {
    return {
      ...t,
      fromAddress: t.fromAddress ?? t.pickupAddress,
      toAddress: t.toAddress ?? t.dropoffAddress,
      availableSeats: t.availableSeats ?? t.seatsAvailable ?? 1,
    };
  }

  async function loadTrips() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ matches?: CarpoolTrip[]; trips?: CarpoolTrip[]; data?: CarpoolTrip[] }>(
        `/api/carpool?pickupLat=${pickupLat}&pickupLng=${pickupLng}&dropoffLat=${dropoffLat}&dropoffLng=${dropoffLng}`,
      );
      const raw = res.matches ?? res.trips ?? res.data ?? [];
      setTrips(raw.map(normalizeTrip));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const dt = new Date(Date.now() + 3 * 3600000);
    setDepartureAt(dt.toISOString().slice(0, 16));
    loadTrips();
  }, []);

  async function joinTrip(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/carpool/${id}/join`, {
        method: "POST",
        body: JSON.stringify({ seats: 1 }),
      });
      await loadTrips();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de rejoindre");
    } finally {
      setBusy(false);
    }
  }

  async function estimateCreate() {
    const seatCount = parseInt(seats, 10);
    if (!to.trim()) { setError("Indiquez la destination"); return; }
    if (seatCount < 1 || seatCount > 6) { setError("Places : entre 1 et 6"); return; }
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<{ totalPriceCdf?: number; pricePerSeatCdf?: number }>("/api/carpool/estimate", {
        method: "POST",
        body: JSON.stringify({ fromAddress: from, toAddress: to, seats: seatCount }),
      });
      setEstimate({ total: data.totalPriceCdf ?? 15000, perSeat: data.pricePerSeatCdf });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Estimation impossible");
    } finally {
      setBusy(false);
    }
  }

  async function createTrip() {
    const seatCount = parseInt(seats, 10);
    if (!estimate?.perSeat) { await estimateCreate(); return; }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/carpool", {
        method: "POST",
        body: JSON.stringify({
          departureAt: new Date(departureAt).toISOString(),
          pickupLat,
          pickupLng,
          pickupAddress: from,
          dropoffLat,
          dropoffLng,
          dropoffAddress: to,
          seatsTotal: seatCount,
          pricePerSeatCdf: estimate.perSeat,
        }),
      });
      setEstimate(null);
      setTab("search");
      await loadTrips();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publication impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <h2 className="text-lg font-semibold">Covoiturage</h2>
      {mock && <p className="text-xs text-[#FF6B35] bg-orange-50 rounded-lg py-2 px-3">Mode démo</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("search")}
          className={`flex-1 py-2 rounded-xl text-sm font-medium ${tab === "search" ? "bg-[#6C63FF] text-white" : "bg-white"}`}
        >
          Rechercher
        </button>
        <button
          type="button"
          onClick={() => setTab("create")}
          className={`flex-1 py-2 rounded-xl text-sm font-medium ${tab === "create" ? "bg-[#6C63FF] text-white" : "bg-white"}`}
        >
          Proposer
        </button>
      </div>

      {tab === "search" ? (
        <>
          <input className="w-full rounded-xl border-0 bg-white p-3 shadow-sm" placeholder="Destination" value={to} onChange={(e) => setTo(e.target.value)} />
          <button type="button" onClick={loadTrips} disabled={loading} className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-medium">
            Rechercher
          </button>
          {loading ? (
            <p className="text-sm text-gray-500 text-center">Chargement…</p>
          ) : trips.length === 0 ? (
            <p className="text-sm text-gray-500 text-center">Aucun trajet</p>
          ) : (
            <div className="space-y-2">
              {trips.map((t) => (
                <div key={t.id} className="bg-white rounded-xl p-3 shadow-sm">
                  <p className="font-medium">{t.fromAddress} → {t.toAddress}</p>
                  <p className="text-xs text-gray-500">
                    {t.driverName} · {t.availableSeats} place(s)
                    {t.passengerCount ? ` · ${t.passengerCount} passager(s)` : ""}
                  </p>
                  {t.departureAt && (
                    <p className="text-xs text-gray-500">Départ : {new Date(t.departureAt).toLocaleString("fr-CD")}</p>
                  )}
                  <div className="flex justify-between items-center mt-2">
                    <span className="font-bold text-[#00D4A1]">{formatCdf(t.pricePerSeatCdf ?? 0)} / pers.</span>
                    <button type="button" disabled={busy} onClick={() => joinTrip(t.id)} className="text-sm bg-[#6C63FF] text-white px-4 py-2 rounded-lg">
                      Rejoindre
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <input type="datetime-local" className="w-full rounded-xl bg-gray-50 p-3" value={departureAt} onChange={(e) => setDepartureAt(e.target.value)} />
          <input className="w-full rounded-xl bg-gray-50 p-3" placeholder="Départ" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="w-full rounded-xl bg-gray-50 p-3" placeholder="Destination" value={to} onChange={(e) => { setTo(e.target.value); setEstimate(null); }} />
          <input className="w-full rounded-xl bg-gray-50 p-3" type="number" min={1} max={6} placeholder="Places" value={seats} onChange={(e) => { setSeats(e.target.value); setEstimate(null); }} />
          {estimate && (
            <p className="text-center text-[#00D4A1] font-bold">
              {formatCdf(estimate.perSeat ?? 0)} / passager · total {formatCdf(estimate.total ?? 0)}
            </p>
          )}
          <button
            type="button"
            onClick={estimate ? createTrip : estimateCreate}
            disabled={busy}
            className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-medium"
          >
            {estimate ? "Publier le trajet" : "Estimer le prix"}
          </button>
        </div>
      )}
    </div>
  );
}
