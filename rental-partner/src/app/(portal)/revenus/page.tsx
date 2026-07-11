"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth";
import {
  fetchEarnings,
  fetchEarningsReport,
  formatCdf,
  getApiBase,
  type PartnerEarnings,
} from "@/lib/api";
import {
  downloadPartnerReportPdf,
  exportPartnerReportCsv,
  printPartnerReport,
  type PartnerEarningsReport,
} from "@/lib/partner-reports";
import { PartnerWithdrawPanel } from "@/components/PartnerWithdrawPanel";
import { WalletMovementHistory } from "@/components/WalletMovementHistory";

export default function RevenusPage() {
  const [earnings, setEarnings] = useState<PartnerEarnings | null>(null);
  const [report, setReport] = useState<PartnerEarningsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [walletHistoryRefresh, setWalletHistoryRefresh] = useState(0);

  const loadReport = useCallback(async () => {
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
    loadReport();
  }, [loadReport]);

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
        "/api/rental-partner/earnings/report/pdf",
        authHeaders,
        "mova-location-rapport",
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
        <h2 className="text-xl font-semibold text-[#1A1A2E]">Revenus location</h2>
        <p className="text-sm text-gray-600 mt-1">
          Solde crédité après paiement des locations. Filtrez, exportez ou imprimez votre rapport financier.
        </p>
      </div>

      {loading && <p className="text-gray-500">Chargement…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {earnings && (
        <>
          <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white p-6 shadow-md">
            <p className="text-sm opacity-90">Solde disponible</p>
            <p className="text-3xl font-bold mt-1">{earnings.formattedBalance}</p>
          </div>
          <PartnerWithdrawPanel
            balanceCdf={earnings.balanceCdf}
            onWithdrawn={() => {
              setLoading(true);
              setWalletHistoryRefresh((n) => n + 1);
              loadReport();
            }}
          />
          <WalletMovementHistory refreshKey={walletHistoryRefresh} />
        </>
      )}

      <section className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
        <h3 className="font-medium text-sm text-gray-700">Recherche avancée</h3>
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
            Recherche (référence, description)
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Ex. réservation, véhicule…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setLoading(true); loadReport(); }} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm">
            Appliquer
          </button>
          <button
            type="button"
            disabled={!report || exporting}
            onClick={() => report && exportPartnerReportCsv(report, "mova-location-rapport")}
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
            onClick={() => report && printPartnerReport(report, "Rapport financier — Location MOVA")}
            className="px-4 py-2 rounded-xl border text-sm disabled:opacity-50"
          >
            Imprimer
          </button>
        </div>
      </section>

      {report && (
        <section>
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <h3 className="font-medium text-[#1A1A2E]">Opérations ({report.periodCount})</h3>
            <p className="text-sm text-gray-600">Total période : <strong>{formatCdf(report.periodTotalCdf)}</strong></p>
          </div>
          {report.data.length === 0 ? (
            <p className="text-sm text-gray-500 rounded-xl border border-dashed p-6 text-center">Aucune opération sur cette période.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white overflow-hidden">
              {report.data.map((row) => (
                <li key={row.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{row.description ?? "Crédit location"}</p>
                    <p className="text-xs text-gray-500">{row.createdAt ? new Date(row.createdAt).toLocaleString("fr-CD") : "—"}</p>
                    {row.reference && <p className="text-xs font-mono text-gray-400">{row.reference}</p>}
                  </div>
                  <span className="text-sm font-semibold text-green-700">+{formatCdf(row.amountCdf)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
