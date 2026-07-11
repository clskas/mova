"use client";

import { useEffect, useState } from "react";
import { phoneFromToken } from "@/lib/auth";
import { formatCdf, withdrawPartnerWallet } from "@/lib/api";

const PAYOUT_PHONE_KEY = "mova_restaurant_payout_phone";

const PROVIDERS = [
  { value: "ORANGE_MONEY", label: "Orange Money" },
  { value: "MPESA", label: "M-Pesa" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
];

type Props = {
  balanceCdf: number;
  onWithdrawn?: () => void;
};

export function PartnerWithdrawPanel({ balanceCdf, onWithdrawn }: Props) {
  const [amount, setAmount] = useState("");
  const [provider, setProvider] = useState("ORANGE_MONEY");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(PAYOUT_PHONE_KEY);
    if (saved) {
      setPhone(saved);
      return;
    }
    const fromToken = phoneFromToken();
    if (fromToken) setPhone(fromToken);
  }, []);

  async function submit() {
    const amountCdf = Number(amount);
    if (!Number.isFinite(amountCdf) || amountCdf < 500) {
      setError("Montant minimum : 500 FC.");
      return;
    }
    if (amountCdf > balanceCdf) {
      setError("Montant supérieur au solde disponible.");
      return;
    }
    if (!phone.trim()) {
      setError("Numéro Mobile Money requis.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await withdrawPartnerWallet({
        amountCdf,
        provider,
        phone: phone.trim(),
      });
      localStorage.setItem(PAYOUT_PHONE_KEY, phone.trim());
      setSuccess(result.message ?? "Retrait initié avec succès.");
      setAmount("");
      onWithdrawn?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retrait impossible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-4 space-y-4">
      <div>
        <h3 className="font-medium text-[#1A1A2E]">Retirer vers Mobile Money</h3>
        <p className="text-xs text-gray-500 mt-1">
          Transférez votre solde vers Orange Money, M-Pesa ou Airtel Money. Minimum 500 FC.
          Solde disponible : <strong>{formatCdf(balanceCdf)}</strong>
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-500">
          Montant (FC)
          <input
            type="number"
            min={500}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="5000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-500">
          Opérateur
          <select
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500 sm:col-span-2">
          Numéro Mobile Money (+243…)
          <input
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="+243812345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={loading || balanceCdf < 500}
        onClick={submit}
        className="px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Retrait en cours…" : "Retirer mes revenus"}
      </button>
      {success && <p className="text-sm text-green-700">{success}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
