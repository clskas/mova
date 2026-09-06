"use client";

import { useEffect, useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";
import { GPS_OR_SUGGESTION_FR, suggestionPoint, useDrcPickup } from "@/lib/drc-location";
import { toUserErrorMessage } from "@/lib/user-messages";
import { GeoAutocompleteInput } from "./GeoAutocompleteInput";
import { VEHICLE_CATEGORIES, defaultTypeForCategory, normalizeVehicleType, vehicleCategory, vehicleTypesForCategory } from "@/lib/vehicle-type";

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
  const { pickup } = useDrcPickup();
  const [destination, setDestination] = useState("");
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [vehicleType, setVehicleType] = useState("MOTO_TAXI");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadUpcoming() {
    setLoading(true);
    try {
      const res = await apiFetch<{ data?: ScheduledRide[] }>("/api/rides/scheduled", undefined, { useMock: mock });
      setRides(res.data ?? []);
    } catch (e) {
      setError(toUserErrorMessage(e, "Erreur"));
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
    if (!pickup || !dropoff) {
      setError(GPS_OR_SUGGESTION_FR);
      return;
    }
    setBooking(true);
    setError(null);
    try {
      const data = await apiFetch<{ estimatedPriceCdf?: number }>("/api/rides/scheduled/estimate", {
        method: "POST",
        body: JSON.stringify({
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          dropoffLat: dropoff.lat,
          dropoffLng: dropoff.lng,
          pickupAddress: "Ma position",
          dropoffAddress: destination,
          vehicleType: normalizeVehicleType(vehicleType),
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      }, { useMock: mock });
      setEstimate(data.estimatedPriceCdf ?? 9500);
    } catch (e) {
      setError(toUserErrorMessage(e, "Estimation impossible"));
    } finally {
      setBooking(false);
    }
  }

  async function handleBook() {
    if (!pickup || !dropoff) {
      setError(GPS_OR_SUGGESTION_FR);
      return;
    }
    setBooking(true);
    setError(null);
    try {
      await apiFetch("/api/rides/scheduled", {
        method: "POST",
        body: JSON.stringify({
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          dropoffLat: dropoff.lat,
          dropoffLng: dropoff.lng,
          pickupAddress: "Ma position",
          dropoffAddress: destination,
          vehicleType: normalizeVehicleType(vehicleType),
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      }, { useMock: mock });
      setDestination("");
      setEstimate(null);
      await loadUpcoming();
    } catch (e) {
      setError(toUserErrorMessage(e, "Réservation impossible"));
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
        <GeoAutocompleteInput
          placeholder="Destination"
          value={destination}
          proximityLat={pickup?.lat}
          proximityLng={pickup?.lng}
          onChange={(v) => { setDestination(v); setDropoff(null); setEstimate(null); }}
          onSelect={(s) => setDropoff(suggestionPoint(s))}
          className="w-full rounded-xl border-0 bg-gray-50 p-3"
        />
        <input
          type="datetime-local"
          className="w-full rounded-xl border-0 bg-gray-50 p-3"
          value={scheduledAt}
          onChange={(e) => { setScheduledAt(e.target.value); setEstimate(null); }}
        />
        <p className="text-sm font-medium">Taxi ou moto</p>
        <div className="flex gap-2">
          {VEHICLE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`flex-1 rounded-xl p-2 text-sm font-medium ${
                vehicleCategory(vehicleType) === c.id ? "bg-[#6C63FF] text-white" : "bg-gray-50"
              }`}
              onClick={() => {
                setVehicleType(defaultTypeForCategory(c.id));
                setEstimate(null);
              }}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
        {vehicleCategory(vehicleType) === "TAXI" &&
          vehicleTypesForCategory("TAXI").map((v) => (
            <label key={v.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="scheduled-vehicle"
                checked={normalizeVehicleType(vehicleType) === v.id}
                onChange={() => { setVehicleType(v.id); setEstimate(null); }}
              />
              {v.icon} {v.label}
            </label>
          ))}
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
