"use client";

import { useEffect, useState } from "react";
import { phoneFromToken } from "@/lib/auth";
import { formatCdf, topUpPartnerWallet, withdrawPartnerWallet } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";

const PAYOUT_PHONE_KEY = "mova_restaurant_payout_phone";

const PROVIDERS = [
  { value: "ORANGE_MONEY", label: "Orange Money" },
  { value: "MPESA", label: "M-Pesa" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
];

type Props = {
  balanceCdf: number;
  walletAvailable?: boolean;
  onWithdrawn?: () => void;
};

export function PartnerWithdrawPanel({ balanceCdf, walletAvailable = true, onWithdrawn }: Props) {
  const [amount, setAmount] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [provider, setProvider] = useState("ORANGE_MONEY");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState<"withdraw" | "topup" | null>(null);
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

  function rememberPhone() {
    if (phone.trim()) localStorage.setItem(PAYOUT_PHONE_KEY, phone.trim());
  }

  async function submitWithdraw() {
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
    setLoading("withdraw");
    setError(null);
    setSuccess(null);
    try {
      const result = await withdrawPartnerWallet({
        amountCdf,
        provider,
        phone: phone.trim(),
      });
      rememberPhone();
      setSuccess(result.message ?? "Retrait initié avec succès.");
      setAmount("");
      onWithdrawn?.();
    } catch (e) {
      setError(toUserErrorMessage(e, "Retrait impossible"));
    } finally {
      setLoading(null);
    }
  }

  async function submitTopUp() {
    const amountCdf = Number(topUpAmount);
    if (!Number.isFinite(amountCdf) || amountCdf < 500) {
      setError("Montant minimum : 500 FC.");
      return;
    }
    if (!phone.trim()) {
      setError("Numéro Mobile Money requis.");
      return;
    }
    setLoading("topup");
    setError(null);
    setSuccess(null);
    try {
      const result = await topUpPartnerWallet({
        amountCdf,
        provider,
        phone: phone.trim(),
      });
      rememberPhone();
      setSuccess(result.message ?? "Recharge initiée. Confirmez sur votre téléphone.");
      setTopUpAmount("");
      onWithdrawn?.();
    } catch (e) {
      setError(toUserErrorMessage(e, "Recharge impossible"));
    } finally {
      setLoading(null);
    }
  }

  if (!walletAvailable) {
    return (
      <section className="rounded-xl border border-gray-100 bg-white p-4">
        <h3 className="font-medium text-[#1A1A2E]">Portefeuille Mobile Money</h3>
        <p className="text-sm text-gray-500 mt-2">
          Recharge et retraits seront disponibles dès que le hub de paiement sera joignable.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-4 space-y-5">
      <div>
        <h3 className="font-medium text-[#1A1A2E]">Portefeuille Mobile Money</h3>
        <p className="text-xs text-gray-500 mt-1">
          Orange Money, M-Pesa ou Airtel Money. Minimum 500 FC. Solde :{" "}
          <strong>{formatCdf(balanceCdf)}</strong>
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
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
        <label className="text-xs text-gray-500">
          Numéro Mobile Money (+243…)
          <input
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="+243812345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium text-[#1A1A2E]">Recharger</p>
          <input
            type="number"
            min={500}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="500"
            value={topUpAmount}
            onChange={(e) => setTopUpAmount(e.target.value)}
          />
          <button
            type="button"
            disabled={loading !== null}
            onClick={submitTopUp}
            className="px-4 py-2.5 min-h-11 rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 w-full"
          >
            {loading === "topup" ? "Recharge…" : "Recharger (min. 500 FC)"}
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-[#1A1A2E]">Retirer</p>
          <input
            type="number"
            min={500}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="5000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            disabled={loading !== null || balanceCdf < 500}
            onClick={submitWithdraw}
            className="px-4 py-2.5 min-h-11 rounded-xl bg-orange-600 text-white text-sm font-medium disabled:opacity-50 w-full"
          >
            {loading === "withdraw" ? "Retrait en cours…" : "Retirer mes revenus"}
          </button>
        </div>
      </div>
      {success && <p className="text-sm text-green-700">{success}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
