"use client";

import { useEffect, useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";

type Props = { onBack: () => void; mock: boolean };

type WalletData = {
  balanceCdf?: number;
  transactions?: { type?: string; amountCdf?: number; description?: string; createdAt?: string }[];
};

export function WalletView({ onBack, mock }: Props) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [amount, setAmount] = useState("10000");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<WalletData>("/api/wallet", undefined, { useMock: mock });
      setWallet(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [mock]);

  async function topUp() {
    const value = parseInt(amount, 10);
    if (value < 500) {
      setError("Montant minimum : 500 FC");
      return;
    }
    setTopUpLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ balanceCdf?: number; message?: string }>("/api/wallet/top-up", {
        method: "POST",
        body: JSON.stringify({ provider: mock ? "MOCK" : "ORANGE_MONEY", amountCdf: value, phone: "+243812345678" }),
      }, { useMock: mock });
      if (res.balanceCdf != null) {
        setWallet((w) => ({ ...w, balanceCdf: res.balanceCdf }));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la recharge");
    } finally {
      setTopUpLoading(false);
    }
  }

  const transactions = wallet?.transactions ?? [];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <h2 className="text-lg font-semibold">Portefeuille MOVA</h2>
      {mock && (
        <p className="text-xs text-[#FF6B35] bg-orange-50 rounded-lg py-2 px-3">Mode démo — passerelle indisponible</p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      <div className="bg-white rounded-xl p-6 shadow-sm text-center">
        <p className="text-sm text-gray-500">Solde disponible</p>
        <p className="text-3xl font-bold text-[#00D4A1] mt-1">
          {loading ? "…" : formatCdf(wallet?.balanceCdf ?? 0)}
        </p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <p className="font-medium text-sm">Recharger (mock)</p>
        <input
          className="w-full rounded-xl border-0 bg-gray-50 p-3"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Montant FC"
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

      <div>
        <p className="font-medium mb-2">Transactions récentes</p>
        {loading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune transaction</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx, i) => {
              const amt = tx.amountCdf ?? 0;
              const credit = amt >= 0;
              return (
                <div key={i} className="bg-white rounded-xl p-3 shadow-sm flex justify-between items-center">
                  <div>
                    <p className="font-medium text-sm">{tx.description ?? (credit ? "Recharge" : "Paiement")}</p>
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
