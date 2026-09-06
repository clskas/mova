"use client";

import { useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";
import { GPS_OR_SUGGESTION_FR, suggestionPoint, useDrcPickup } from "@/lib/drc-location";
import { toUserErrorMessage } from "@/lib/user-messages";
import { GeoAutocompleteInput } from "./GeoAutocompleteInput";

type Props = { onBack: () => void; mock: boolean };

export function ExpressDelivery({ onBack, mock }: Props) {
  const { pickup: gpsPickup } = useDrcPickup();
  const [pickup, setPickup] = useState("Ma position");
  const [pickupPoint, setPickupPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState("");
  const [dropoffPoint, setDropoffPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  const payload = () => {
    const from = pickupPoint ?? gpsPickup;
    if (!from || !dropoffPoint) return null;
    return {
      pickupAddress: pickup,
      dropoffAddress: dropoff,
      weightCategory: "LIGHT",
      pickupLat: from.lat,
      pickupLng: from.lng,
      dropoffLat: dropoffPoint.lat,
      dropoffLng: dropoffPoint.lng,
    };
  };

  async function handleEstimate() {
    if (!dropoff.trim()) return;
    const body = payload();
    if (!body) {
      setError(GPS_OR_SUGGESTION_FR);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ estimatedPriceCdf?: number }>(
        "/api/express/estimate",
        { method: "POST", body: JSON.stringify(body) },
        { useMock: mock },
      );
      setEstimate(data.estimatedPriceCdf ?? 7500);
    } catch (e) {
      setError(toUserErrorMessage(e, "Erreur d'estimation"));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    const body = payload();
    if (!body) {
      setError(GPS_OR_SUGGESTION_FR);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ delivery?: { id?: string } }>(
        "/api/express",
        { method: "POST", body: JSON.stringify(body) },
        { useMock: mock },
      );
      setTrackingId(data.delivery?.id ?? null);
      setConfirmed(true);
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de créer la livraison"));
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
      <GeoAutocompleteInput
        placeholder="Adresse d'enlèvement"
        value={pickup}
        proximityLat={gpsPickup?.lat}
        proximityLng={gpsPickup?.lng}
        onChange={setPickup}
        onSelect={(s) => setPickupPoint(suggestionPoint(s))}
      />
      <GeoAutocompleteInput
        placeholder="Adresse de livraison"
        value={dropoff}
        proximityLat={(pickupPoint ?? gpsPickup)?.lat}
        proximityLng={(pickupPoint ?? gpsPickup)?.lng}
        onChange={(v) => { setDropoff(v); setDropoffPoint(null); setEstimate(null); }}
        onSelect={(s) => setDropoffPoint(suggestionPoint(s))}
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
