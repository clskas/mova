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
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        undefined,
        { useMock: mock },
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
    loadTrips();
  }, []);

  async function joinTrip(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/carpool/${id}/join`, {
        method: "POST",
        body: JSON.stringify({ seats: 1 }),
      }, { useMock: mock });
      await loadTrips();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de rejoindre");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <h2 className="text-lg font-semibold">Covoiturage</h2>
      <p className="text-xs text-gray-500">
        Recherchez et rejoignez un trajet. La publication est réservée aux chauffeurs SENGA.
      </p>
      {mock && <p className="text-xs text-[#FF6B35] bg-orange-50 rounded-lg py-2 px-3">Mode démo</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

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
              <div className="flex justify-between items-center mt-2 gap-2">
                <span className="font-bold text-[#00D4A1] shrink-0">{formatCdf(t.pricePerSeatCdf ?? 0)} / pers.</span>
                <button type="button" disabled={busy} onClick={() => joinTrip(t.id)} className="text-sm bg-[#6C63FF] text-white px-4 py-2 rounded-lg shrink-0">
                  Rejoindre
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
