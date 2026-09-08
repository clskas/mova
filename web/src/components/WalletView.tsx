"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";
import { getStoredPhone } from "@/lib/auth";
import { toUserErrorMessage } from "@/lib/user-messages";
import { isWalletRecharge, isWalletWithdraw, walletTxLabel } from "@/lib/wallet-movements";
import { WalletMovementHistory } from "./WalletMovementHistory";

type Props = { onBack: () => void; mock: boolean };

type WalletData = {
  balanceCdf?: number;
  transactions?: { type?: string; amountCdf?: number; description?: string; createdAt?: string }[];
};

export function WalletView({ onBack, mock }: Props) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [amount, setAmount] = useState("10000");
  const [topUpPhone, setTopUpPhone] = useState("");
  const [topUpProvider, setTopUpProvider] = useState("ORANGE_MONEY");
  const [withdrawAmount, setWithdrawAmount] = useState("5000");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [withdrawProvider, setWithdrawProvider] = useState("ORANGE_MONEY");
  const [withdrawOtp, setWithdrawOtp] = useState("");
  const [withdrawOtpSent, setWithdrawOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const topUpInFlight = useRef(false);
  const withdrawInFlight = useRef(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<WalletData>("/api/wallet", undefined, { useMock: mock });
      setWallet(data);
    } catch (e) {
      setError(toUserErrorMessage(e, "Erreur de chargement"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = getStoredPhone()?.trim();
    if (stored && !stored.includes("@")) {
      setTopUpPhone((p) => p || stored);
      setWithdrawPhone((p) => p || stored);
    }
  }, []);

  useEffect(() => {
    load();
  }, [mock]);

  async function topUp() {
    if (topUpInFlight.current) return;
    const value = parseInt(amount, 10);
    if (value < 2300) {
      setError("Montant minimum SerdiPay : 2 300 FC");
      return;
    }
    if (!mock && !topUpPhone.trim()) {
      setError("Indiquez le numéro Mobile Money à débiter.");
      return;
    }
    if (!mock) {
      const digits = topUpPhone.replace(/\D/g, "");
      const nsn = digits.startsWith("243") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
      const prefix = nsn.slice(0, 2);
      const prefixes: Record<string, string[]> = {
        ORANGE_MONEY: ["80", "84", "85", "89"],
        MPESA: ["81", "82", "83"],
        AIRTEL_MONEY: ["97", "98", "99"],
      };
      const allowed = prefixes[topUpProvider];
      if (allowed && !allowed.includes(prefix)) {
        setError(
          topUpProvider === "ORANGE_MONEY"
            ? "Ce numéro n’est pas un numéro Orange Money (préfixes 80, 84, 85, 89). Saisissez le numéro de la SIM Orange — le push USSD arrive sur CE numéro. SENGA n’ouvre pas le composeur."
            : "Ce numéro ne correspond pas à l’opérateur choisi. Le push USSD arrive sur le numéro saisi.",
        );
        return;
      }
    }
    topUpInFlight.current = true;
    setTopUpLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await apiFetch<{
        balanceCdf?: number;
        message?: string;
        paymentUrl?: string;
        ussdCode?: string;
        pendingMobileMoney?: boolean;
      }>("/api/wallet/top-up", {
        method: "POST",
        body: JSON.stringify({
          provider: mock ? "MOCK" : topUpProvider,
          amountCdf: value,
          phone: topUpPhone.trim() || undefined,
        }),
      }, { useMock: mock });
      if (res.paymentUrl) {
        window.open(res.paymentUrl, "_blank", "noopener,noreferrer");
      }
      if (res.balanceCdf != null) {
        setWallet((w) => ({ ...w, balanceCdf: res.balanceCdf }));
      }
      await load();
      setHistoryRefresh((n) => n + 1);
      if (res.pendingMobileMoney) {
        setInfo(
          res.message ??
            (topUpProvider === "ORANGE_MONEY"
              ? "Push Orange Money demandé. SENGA n’ouvre pas le composeur : attendez *144# sur le numéro saisi (min. 2 300 FC)."
              : "Confirmez le push USSD / PIN sur le numéro saisi."),
        );
      }
    } catch (e) {
      setError(toUserErrorMessage(e, "Échec de la recharge"));
    } finally {
      topUpInFlight.current = false;
      setTopUpLoading(false);
    }
  }

  async function requestWithdrawOtp() {
    if (withdrawInFlight.current) return;
    const value = parseInt(withdrawAmount, 10);
    if (value < 2300) {
      setError("Montant minimum : 2 300 FC");
      return;
    }
    if (value > (wallet?.balanceCdf ?? 0)) {
      setError("Solde insuffisant");
      return;
    }
    if (!withdrawPhone.trim()) {
      setError("Numéro Mobile Money requis.");
      return;
    }
    withdrawInFlight.current = true;
    setWithdrawLoading(true);
    setError(null);
    try {
      await apiFetch<{ message?: string }>("/api/wallet/withdraw/otp", {
        method: "POST",
        body: JSON.stringify({
          provider: withdrawProvider,
          amountCdf: value,
          phone: withdrawPhone.trim(),
        }),
      }, { useMock: mock });
      setWithdrawOtpSent(true);
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible d’envoyer le code"));
    } finally {
      withdrawInFlight.current = false;
      setWithdrawLoading(false);
    }
  }

  async function withdraw() {
    if (withdrawInFlight.current) return;
    if (!withdrawOtpSent) {
      await requestWithdrawOtp();
      return;
    }
    const value = parseInt(withdrawAmount, 10);
    if (!/^\d{6}$/.test(withdrawOtp.trim())) {
      setError("Entrez le code à 6 chiffres reçu sur le numéro de versement.");
      return;
    }
    withdrawInFlight.current = true;
    setWithdrawLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ balanceCdf?: number; message?: string }>("/api/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({
          provider: withdrawProvider,
          amountCdf: value,
          phone: withdrawPhone.trim(),
          otp: withdrawOtp.trim(),
        }),
      }, { useMock: mock });
      if (res.balanceCdf != null) {
        setWallet((w) => ({ ...w, balanceCdf: res.balanceCdf }));
      }
      setWithdrawOtp("");
      setWithdrawOtpSent(false);
      await load();
      setHistoryRefresh((n) => n + 1);
    } catch (e) {
      setError(toUserErrorMessage(e, "Échec du retrait"));
    } finally {
      withdrawInFlight.current = false;
      setWithdrawLoading(false);
    }
  }

  const otherTransactions = (wallet?.transactions ?? []).filter(
    (tx) => !isWalletRecharge(tx) && !isWalletWithdraw(tx),
  );

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <h2 className="text-lg font-semibold">Portefeuille SENGA</h2>
      {mock && (
        <p className="text-xs text-[#FF6B35] bg-orange-50 rounded-lg py-2 px-3">Mode démo — passerelle indisponible</p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      {info && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-lg p-3">{info}</p>}

      <div className="bg-white rounded-xl p-6 shadow-sm text-center">
        <p className="text-sm text-gray-500">Solde disponible</p>
        <p className="text-3xl font-bold text-[#00D4A1] mt-1">
          {loading ? "…" : formatCdf(wallet?.balanceCdf ?? 0)}
        </p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <p className="font-medium text-sm">Recharger</p>
        <p className="text-xs text-gray-500">
          Orange Money : push USSD (*144#) sur le numéro de la SIM Orange — SENGA n’ouvre pas le composeur. Minimum 2 300 FC.
        </p>
        <input
          className="w-full rounded-xl border-0 bg-gray-50 p-3"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Montant FC (min. 2 300)"
        />
        <select
          className="w-full rounded-xl border-0 bg-gray-50 p-3"
          value={topUpProvider}
          onChange={(e) => setTopUpProvider(e.target.value)}
        >
          <option value="ORANGE_MONEY">Orange Money</option>
          <option value="MPESA">M-Pesa</option>
          <option value="AIRTEL_MONEY">Airtel Money</option>
        </select>
        <input
          className="w-full rounded-xl border-0 bg-gray-50 p-3"
          value={topUpPhone}
          onChange={(e) => setTopUpPhone(e.target.value)}
          placeholder="+243… (numéro Mobile Money)"
        />
        <button
          type="button"
          onClick={topUp}
          disabled={topUpLoading}
          className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-medium disabled:opacity-50"
        >
          {topUpLoading ? "Recharge…" : "Recharger"}
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <p className="font-medium text-sm">Retirer vers Mobile Money</p>
        <input
          className="w-full rounded-xl border-0 bg-gray-50 p-3"
          type="number"
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value)}
          placeholder="Montant FC"
        />
        <select
          className="w-full rounded-xl border-0 bg-gray-50 p-3"
          value={withdrawProvider}
          onChange={(e) => setWithdrawProvider(e.target.value)}
        >
          <option value="ORANGE_MONEY">Orange Money</option>
          <option value="MPESA">M-Pesa</option>
          <option value="AIRTEL_MONEY">Airtel Money</option>
        </select>
        <input
          className="w-full rounded-xl border-0 bg-gray-50 p-3"
          value={withdrawPhone}
          onChange={(e) => {
            setWithdrawPhone(e.target.value);
            setWithdrawOtpSent(false);
            setWithdrawOtp("");
          }}
          placeholder="+243…"
        />
        {withdrawOtpSent && (
          <input
            className="w-full rounded-xl border-0 bg-gray-50 p-3"
            value={withdrawOtp}
            onChange={(e) => setWithdrawOtp(e.target.value)}
            inputMode="numeric"
            maxLength={6}
            placeholder="Code SMS (6 chiffres)"
          />
        )}
        <button
          type="button"
          onClick={withdraw}
          disabled={withdrawLoading || (wallet?.balanceCdf ?? 0) < 2300}
          className="w-full border border-[#6C63FF] text-[#6C63FF] rounded-xl py-3 font-medium disabled:opacity-50"
        >
          {withdrawLoading ? "Retrait…" : withdrawOtpSent ? "Confirmer le retrait" : "Envoyer le code SMS"}
        </button>
      </div>

      <WalletMovementHistory mock={mock} refreshKey={historyRefresh} />

      <div>
        <p className="font-medium mb-2">Autres transactions récentes</p>
        {loading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : otherTransactions.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune autre transaction</p>
        ) : (
          <div className="space-y-2">
            {otherTransactions.map((tx, i) => {
              const amt = tx.amountCdf ?? 0;
              const credit = amt >= 0;
              return (
                <div key={i} className="bg-white rounded-xl p-3 shadow-sm flex justify-between items-center">
                  <div>
                    <p className="font-medium text-sm">{walletTxLabel(tx)}</p>
                    <p className="text-xs text-gray-500">{tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("fr-CD") : ""}</p>
                  </div>
                  <p className={`font-bold ${credit ? "text-[#00D4A1]" : "text-[#1A1A2E]"}`}>
                    {credit ? "+" : ""}{formatCdf(Math.abs(amt))}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
