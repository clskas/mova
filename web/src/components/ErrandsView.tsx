"use client";

import { useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";
import { GeoAutocompleteInput } from "./GeoAutocompleteInput";
import { PromoCodeInput, promoPayload } from "./PromoCodeInput";

type Props = { onBack: () => void; mock: boolean };

export function ErrandsView({ onBack, mock }: Props) {
  const [pickup, setPickup] = useState("Commerce / pharmacie, Gombe");
  const [dropoff, setDropoff] = useState("Ma position");
  const [itemInput, setItemInput] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  function addItem() {
    const text = itemInput.trim();
    if (!text) return;
    setItems((prev) => [...prev, text]);
    setItemInput("");
    setEstimate(null);
  }

  const payload = () => ({
    pickupAddress: pickup,
    dropoffAddress: dropoff,
    pickupLat: -4.32,
    pickupLng: 15.31,
    dropoffLat: -4.33,
    dropoffLng: 15.32,
    items,
    description: items.join(", "),
    budgetCdf: budget ? Number(budget) : undefined,
    ...promoPayload(promoCode),
  });

  async function handleEstimate() {
    if (items.length === 0) {
      setError("Ajoutez au moins un article à acheter.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ estimatedPriceCdf?: number }>(
        "/api/errands/estimate",
        { method: "POST", body: JSON.stringify(payload()) },
        { useMock: mock },
      );
      setEstimate(data.estimatedPriceCdf ?? 6000);
    } catch (e) {
      setError(toUserErrorMessage(e, "Erreur d'estimation"));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/errands", { method: "POST", body: JSON.stringify(payload()) }, { useMock: mock });
      setConfirmed(true);
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de créer la commande"));
    } finally {
      setLoading(false);
    }
  }

  if (confirmed) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-4xl mb-2">🛒</p>
          <p className="font-semibold">Commission confirmée</p>
          <p className="text-sm text-gray-500 mt-2">Un coursier achètera vos articles et vous les livrera.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <h2 className="text-lg font-semibold">Courses & commissions</h2>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3">{error}</p>}
      <GeoAutocompleteInput placeholder="Où acheter" value={pickup} onChange={setPickup} />
      <GeoAutocompleteInput placeholder="Livraison à" value={dropoff} onChange={setDropoff} />
      <div className="flex gap-2">
        <input className="flex-1 rounded-xl border-0 bg-white p-3 shadow-sm" placeholder="Article (ex: pain, lait…)" value={itemInput} onChange={(e) => setItemInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} />
        <button type="button" onClick={addItem} className="px-4 bg-gray-100 rounded-xl text-sm font-medium">+</button>
      </div>
      {items.length > 0 && (
        <ul className="bg-white rounded-xl p-3 shadow-sm text-sm space-y-1">
          {items.map((item, i) => (
            <li key={item} className="flex justify-between">
              <span>{item}</span>
              <button type="button" className="text-red-500 text-xs" onClick={() => { setItems(items.filter((_, j) => j !== i)); setEstimate(null); }}>Retirer</button>
            </li>
          ))}
        </ul>
      )}
      <input className="w-full rounded-xl border-0 bg-white p-3 shadow-sm" placeholder="Budget articles (FC, optionnel)" value={budget} onChange={(e) => setBudget(e.target.value)} type="number" />
      <PromoCodeInput value={promoCode} onChange={(v) => { setPromoCode(v); setEstimate(null); }} />
      {estimate != null && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-gray-500 text-sm">Frais de service estimés</p>
          <p className="text-2xl font-bold text-[#00D4A1]">{formatCdf(estimate)}</p>
        </div>
      )}
      <button
        type="button"
        onClick={estimate == null ? handleEstimate : handleConfirm}
        disabled={loading}
        className="w-full bg-[#00D4A1] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
      >
        {loading ? "Chargement…" : estimate == null ? "Estimer" : "Commander"}
      </button>
    </div>
  );
}
