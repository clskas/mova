"use client";

import { useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";
import { GeoAutocompleteInput } from "./GeoAutocompleteInput";
import { PromoCodeInput, promoPayload } from "./PromoCodeInput";

const VEHICLES = [
  { id: "MOTO_TAXI", label: "Moto-taxi", icon: "🏍️" },
  { id: "STANDARD", label: "Standard", icon: "🚗" },
  { id: "COMFORT", label: "Confort", icon: "✨" },
];

type Props = { onBack: () => void; mock: boolean };

type RideCreated = { id?: string; status?: string };

export function TaxiBooking({ onBack, mock }: Props) {
  const [destination, setDestination] = useState("");
  const [vehicleType, setVehicleType] = useState("MOTO_TAXI");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rideId, setRideId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function handleEstimate() {
    if (!destination) return;
    setLoading(true);
    setError(null);
    try {
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
    } catch (e) {
      setError(toUserErrorMessage(e, "Estimation impossible"));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const ride = await apiFetch<RideCreated>("/api/rides", {
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
      const id = ride.id;
      if (!id) {
        setError("Course créée mais identifiant manquant.");
        return;
      }
      setRideId(id);
      setSearching(true);
      await apiFetch(`/api/rides/${id}/search`, { method: "POST", body: JSON.stringify({}) }, { useMock: mock }).catch(
        () => undefined,
      );
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de confirmer la course"));
    } finally {
      setLoading(false);
    }
  }

  async function cancelUnmatchedRide(id: string) {
    try {
      await apiFetch(`/api/rides/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Annulé par le passager" }),
      }, { useMock: mock });
    } catch {
      /* already cancelled or réseau */
    }
  }

  async function handleCancelSearch() {
    if (!rideId || cancelling) return;
    const ok = window.confirm("Annuler la recherche de chauffeur ? La course sera annulée.");
    if (!ok) return;
    setCancelling(true);
    await cancelUnmatchedRide(rideId);
    setCancelling(false);
    setSearching(false);
    setRideId(null);
    onBack();
  }

  function handleLeaveSearching() {
    if (!rideId) {
      onBack();
      return;
    }
    void handleCancelSearch();
  }

  if (searching && rideId) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={handleLeaveSearching} className="text-sm text-[#6C63FF]">
          ← Accueil
        </button>
        <div className="bg-white rounded-xl p-6 shadow-sm text-center space-y-3">
          <p className="text-4xl">🔍</p>
          <p className="font-semibold">Recherche d&apos;un chauffeur…</p>
          <p className="text-sm text-gray-500">
            {destination ? `${destination}` : "Course en cours de matching."}
          </p>
          {estimate != null && (
            <p className="text-sm font-medium text-[#6C63FF]">{formatCdf(estimate)}</p>
          )}
          {mock && <p className="text-xs text-[#FF6B35]">Mode démo</p>}
          <button
            type="button"
            onClick={handleCancelSearch}
            disabled={cancelling}
            className="w-full mt-2 border border-red-200 text-red-700 rounded-xl py-3 font-semibold disabled:opacity-50"
          >
            {cancelling ? "Annulation…" : "Annuler"}
          </button>
          <p className="text-xs text-gray-500">
            Fermer cet écran annule la course tant qu&apos;aucun chauffeur n&apos;a accepté.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <h2 className="text-lg font-semibold">Taxi / Moto-taxi</h2>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      <label className="block text-sm font-medium">Destination</label>
      <GeoAutocompleteInput
        placeholder="Ex: Gombe, Limete, Masina…"
        value={destination}
        onChange={(v) => { setDestination(v); setEstimate(null); }}
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
        type="button"
        onClick={estimate == null ? handleEstimate : handleConfirm}
        disabled={loading || !destination}
        className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
      >
        {loading ? "Chargement…" : estimate == null ? "Estimer le prix" : "Confirmer la course"}
      </button>
    </div>
  );
}
