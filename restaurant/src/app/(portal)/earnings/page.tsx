"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authHeaders } from "@/lib/auth";
import {
  downloadOrderReceiptPdf,
  fetchEarnings,
  fetchEarningsReport,
  formatCdf,
  getApiBase,
  type RestaurantEarnings,
} from "@/lib/api";
import {
  downloadPartnerReportPdf,
  exportPartnerReportCsv,
  printPartnerReport,
  type PartnerEarningsReport,
} from "@/lib/partner-reports";
import { PartnerWithdrawPanel } from "@/components/PartnerWithdrawPanel";
import { WalletMovementHistory } from "@/components/WalletMovementHistory";

export default function EarningsPage() {
  const searchParams = useSearchParams();
  const [earnings, setEarnings] = useState<RestaurantEarnings | null>(null);
  const [report, setReport] = useState<PartnerEarningsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [walletHistoryRefresh, setWalletHistoryRefresh] = useState(0);

  useEffect(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from) setFrom(from);
    if (to) setTo(to);
  }, [searchParams]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [e, r] = await Promise.all([
        fetchEarnings(),
        fetchEarningsReport({
          from: from || undefined,
          to: to || undefined,
          q: q.trim() || undefined,
          take: 200,
        }),
      ]);
      setEarnings(e);
      setReport(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [from, to, q]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePdf() {
    if (!report) return;
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (q.trim()) params.q = q.trim();
      await downloadPartnerReportPdf(
        getApiBase(),
        "/api/restaurant/earnings/report/pdf",
        authHeaders,
        "mova-restaurant-rapport",
        params,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export PDF impossible");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#1A1A2E]">Revenus repas</h2>
        <p className="text-sm text-gray-600 mt-1">
          Votre part des ventes est créditée après paiement du client (commission SENGA déduite).
        </p>
      </div>

      {loading && <p className="text-gray-500">Chargement…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {earnings && (
        <>
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 shadow-md">
            <p className="text-sm opacity-90">Solde disponible</p>
            <p className="text-3xl font-bold mt-1">{earnings.formattedBalance}</p>
            <p className="text-xs opacity-80 mt-2">
              Les frais de livraison et la commission plateforme sont versés au livreur et à SENGA.
            </p>
          </div>
          <PartnerWithdrawPanel
            balanceCdf={earnings.balanceCdf}
            onWithdrawn={() => {
              setLoading(true);
              setWalletHistoryRefresh((n) => n + 1);
              load();
            }}
          />
          <WalletMovementHistory refreshKey={walletHistoryRefresh} />
        </>
      )}

      <section className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
        <h3 className="font-medium text-sm text-gray-700">Recherche avancée & rapports</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-gray-500">
            Du
            <input type="date" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-gray-500">
            Au
            <input type="date" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="text-xs text-gray-500 sm:col-span-2">
            Recherche
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Référence commande, description…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setLoading(true); load(); }} className="px-4 py-2 rounded-xl bg-orange-600 text-white text-sm">
            Appliquer
          </button>
          <button
            type="button"
            disabled={!report || exporting}
            onClick={() => report && exportPartnerReportCsv(report, "mova-restaurant-rapport")}
            className="px-4 py-2 rounded-xl border text-sm disabled:opacity-50"
          >
            Export CSV
          </button>
          <button type="button" disabled={!report || exporting} onClick={handlePdf} className="px-4 py-2 rounded-xl border text-sm disabled:opacity-50">
            Télécharger PDF
          </button>
          <button
            type="button"
            disabled={!report}
            onClick={() => report && printPartnerReport(report, "Rapport financier — Restaurant SENGA")}
            className="px-4 py-2 rounded-xl border text-sm disabled:opacity-50"
          >
            Imprimer
          </button>
        </div>
      </section>

      {report && (
        <section>
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <h3 className="font-medium text-[#1A1A2E]">
              {report.data.length > 0 ? "Opérations filtrées" : "Dernières ventes créditées"}
            </h3>
            <p className="text-sm text-gray-600">
              Total période : <strong>{formatCdf(report.periodTotalCdf)}</strong> ({report.periodCount} op.)
            </p>
          </div>
          {(report.data.length === 0 && earnings?.recentFoodSales.length === 0) ? (
            <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-200 p-6 text-center">
              Aucune vente créditée pour le moment.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white overflow-hidden">
              {(report.data.length > 0 ? report.data : earnings?.recentFoodSales ?? []).map((sale) => (
                <li key={sale.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[#1A1A2E]">{sale.description ?? "Vente repas"}</p>
                    <p className="text-xs text-gray-500">
                      {sale.createdAt ? new Date(sale.createdAt).toLocaleString("fr-CD") : "—"}
                    </p>
                    {sale.reference && (
                      <button
                        type="button"
                        onClick={() => downloadOrderReceiptPdf(sale.reference!).catch((e) => alert(e.message))}
                        className="text-xs text-[#6C63FF] underline mt-1"
                      >
                        Télécharger reçu partenaire
                      </button>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-green-700">+{formatCdf(sale.amountCdf)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
