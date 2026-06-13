"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, fetchWalletOverview, normalizeMetrics, type AdminMetrics, type WalletOverview } from "@/lib/api";
import { Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

export default function PortefeuillePage() {
  const [metrics, setMetrics] = useState<AdminMetrics>({});
  const [wallet, setWallet] = useState<WalletOverview>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, w] = await Promise.all([
        apiFetch<AdminMetrics>("/api/admin/metrics"),
        fetchWalletOverview(),
      ]);
      setMetrics(m);
      setWallet(w);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const m = normalizeMetrics(metrics);

  const cards = [
    { label: "Revenus du jour", value: `${m.revenueTodayCdf.toLocaleString("fr-CD")} FC` },
    { label: "Solde agrégé wallets", value: `${(wallet.totalBalanceCdf ?? 0).toLocaleString("fr-CD")} FC` },
    { label: "Paiements en attente", value: `${(wallet.pendingPayoutsCdf ?? 0).toLocaleString("fr-CD")} FC` },
    { label: "Transactions aujourd'hui", value: wallet.transactionsToday ?? 0 },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Portefeuille" subtitle="Vue finance · agrégats plateforme" />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map(({ label, value }) => (
            <Card key={label} className="p-5">
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-[#6C63FF] mt-1">{value}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
