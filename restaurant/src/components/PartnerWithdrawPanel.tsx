"use client";

import { useEffect, useRef, useState } from "react";
import { phoneFromToken } from "@/lib/auth";
import { formatCdf, requestWithdrawOtp, topUpPartnerWallet, withdrawPartnerWallet } from "@/lib/api";
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
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState<"withdraw" | "topup" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inFlight = useRef(false);

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
    if (inFlight.current) return;
    const amountCdf = Number(amount);
    if (!Number.isFinite(amountCdf) || amountCdf < 2300) {
      setError("Montant minimum : 2 300 FC.");
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
    inFlight.current = true;
    setLoading("withdraw");
    setError(null);
    setSuccess(null);
    try {
      if (!otpSent) {
        const sent = await requestWithdrawOtp({
          amountCdf,
          provider,
          phone: phone.trim(),
        });
        if (sent.skipOtp) {
          const result = await withdrawPartnerWallet({
            amountCdf,
            provider,
            phone: phone.trim(),
          });
          rememberPhone();
          setSuccess(result.message ?? "Retrait initié avec succès.");
          setAmount("");
          setOtp("");
          setOtpSent(false);
          onWithdrawn?.();
          return;
        }
        setOtpSent(true);
        setSuccess(sent.message ?? "Code envoyé au numéro de versement.");
        return;
      }
      if (!/^\d{6}$/.test(otp.trim())) {
        setError("Entrez le code à 6 chiffres (SMS ou e-mail).");
        return;
      }
      const result = await withdrawPartnerWallet({
        amountCdf,
        provider,
        phone: phone.trim(),
        otp: otp.trim(),
      });
      rememberPhone();
      setSuccess(result.message ?? "Retrait initié avec succès.");
      setAmount("");
      setOtp("");
      setOtpSent(false);
      onWithdrawn?.();
    } catch (e) {
      setError(toUserErrorMessage(e, "Retrait impossible"));
    } finally {
      inFlight.current = false;
      setLoading(null);
    }
  }

  async function submitTopUp() {
    if (inFlight.current) return;
    const amountCdf = Number(topUpAmount);
    if (!Number.isFinite(amountCdf) || amountCdf < 2300) {
      setError("Minimum SerdiPay : 2 300 FC.");
      return;
    }
    if (!phone.trim()) {
      setError("Numéro Mobile Money requis.");
      return;
    }
    inFlight.current = true;
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
      inFlight.current = false;
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
          Orange Money, M-Pesa ou Airtel Money. Minimum SerdiPay 2 300 FC. Solde :{" "}
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
            min={2300}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="2300"
            value={topUpAmount}
            onChange={(e) => setTopUpAmount(e.target.value)}
          />
          <button
            type="button"
            disabled={loading !== null}
            onClick={submitTopUp}
            className="px-4 py-2.5 min-h-11 rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 w-full"
          >
            {loading === "topup" ? "Recharge…" : "Recharger (min. 2 300 FC)"}
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-[#1A1A2E]">Retirer</p>
          <input
            type="number"
            min={2300}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="5000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {otpSent && (
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              inputMode="numeric"
              maxLength={6}
              placeholder="Code à 6 chiffres"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
          )}
          <button
            type="button"
            disabled={loading !== null || balanceCdf < 2300}
            onClick={submitWithdraw}
            className="px-4 py-2.5 min-h-11 rounded-xl bg-orange-600 text-white text-sm font-medium disabled:opacity-50 w-full"
          >
            {loading === "withdraw"
              ? "Retrait en cours…"
              : otpSent
                ? "Confirmer le retrait"
                : "Envoyer le code"}
          </button>
        </div>
      </div>
      {success && <p className="text-sm text-green-700">{success}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
