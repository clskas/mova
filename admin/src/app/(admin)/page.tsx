"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  apiFetch,
  exportReportsCsv,
  fetchAdminReports,
  formatCdf,
  normalizeMetrics,
  type AdminMetrics,
  type AdminReports,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { BarChart } from "@/components/dashboard/BarChart";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ReportsPanel } from "@/components/dashboard/ReportsPanel";
import { Card, ErrorBanner, LoadingState, PageHeader, StatusBadge } from "@/components/ui";

type Period = 7 | 30 | 90;
type ChartMode = "rides" | "revenue" | "deliveries";

export default function DashboardPage() {
  const { canAccess } = useAdmin();
  const [metrics, setMetrics] = useState<AdminMetrics>({});
  const [reports, setReports] = useState<AdminReports | null>(null);
  const [period, setPeriod] = useState<Period>(30);
  const [chartMode, setChartMode] = useState<ChartMode>("rides");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, r] = await Promise.all([
        apiFetch<AdminMetrics>("/api/admin/metrics"),
        fetchAdminReports(period),
      ]);
      setMetrics(m);
      setReports(r);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger le tableau de bord");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const m = normalizeMetrics(metrics);

  const rideSpark = useMemo(
    () => reports?.daily.map((d) => d.rides) ?? [],
    [reports],
  );
  const revenueSpark = useMemo(
    () => reports?.daily.map((d) => d.revenueCdf) ?? [],
    [reports],
  );

  const chartData = useMemo(() => {
    if (!reports) return [];
    const slice = reports.daily.slice(-14);
    return slice.map((d) => ({
      label: d.date,
      value:
        chartMode === "rides"
          ? d.rides
          : chartMode === "revenue"
            ? d.revenueCdf
            : d.deliveries,
    }));
  }, [reports, chartMode]);

  const kpiCards = [
    { label: "Utilisateurs", value: m.totalUsers, href: "/utilisateurs", section: "utilisateurs" as const, accent: "midnight" as const },
    { label: "Chauffeurs en ligne", value: m.availableDrivers, hint: `${m.approvedDrivers} approuvés`, href: "/chauffeurs", section: "chauffeurs" as const, accent: "green" as const },
    { label: "KYC en attente", value: m.pendingKyc, href: "/kyc", section: "kyc" as const, accent: "orange" as const },
    { label: "Courses actives", value: m.activeRides, hint: `${m.ridesToday} aujourd'hui`, href: "/courses", section: "courses" as const, accent: "violet" as const, sparkline: rideSpark },
    { label: "Livraisons actives", value: m.activeDeliveries, href: "/livraisons", section: "livraisons" as const, accent: "green" as const },
    { label: "Revenus du jour", value: formatCdf(m.revenueTodayCdf), hint: `${m.todayCompleted} courses`, href: "/portefeuille", section: "portefeuille" as const, accent: "violet" as const, sparkline: revenueSpark },
    { label: "Litiges ouverts", value: m.openIncidents, href: "/litiges", section: "litiges" as const, accent: "orange" as const },
    { label: "Alertes SOS", value: m.sosIncidents, href: "/litiges", section: "litiges" as const, accent: "red" as const },
    { label: "Solde wallets", value: formatCdf(m.walletBalanceCdf), hint: `${m.walletCount} comptes`, href: "/portefeuille", section: "portefeuille" as const, accent: "midnight" as const },
    { label: "Planifiées", value: m.scheduledRides, href: "/planifiees", section: "planifiees" as const, accent: "violet" as const },
    { label: "Déménagements", value: m.movingRequests, href: "/demenagements", section: "demenagements" as const, accent: "orange" as const },
    { label: "Covoiturage", value: m.carpoolTrips, href: "/covoiturage", section: "covoiturage" as const, accent: "green" as const },
  ].filter((c) => canAccess(c.section));

  const quickLinks = [
    { label: "Courses en cours", href: "/courses", count: m.activeRides, show: canAccess("courses") },
    { label: "Livraisons", href: "/livraisons", count: m.activeDeliveries, show: canAccess("livraisons") },
    { label: "Valider KYC", href: "/kyc", count: m.pendingKyc, show: canAccess("kyc") },
    { label: "SOS / Litiges", href: "/litiges", count: m.sosIncidents, show: canAccess("litiges") },
  ].filter((l) => l.show);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Tableau de bord"
        subtitle={`${m.city} · couverture nationale · ${lastUpdate ? `MAJ ${lastUpdate.toLocaleTimeString("fr-CD")}` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {([7, 30, 90] as Period[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPeriod(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === d ? "bg-[#6366f1] text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {d}j
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                autoRefresh ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500"
              }`}
            >
              {autoRefresh ? "Auto 60s" : "Manuel"}
            </button>
            <button type="button" onClick={load} className="mova-btn-primary text-sm">
              Actualiser
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-2">
          <ErrorBanner message={error} onRetry={load} />
        </div>
      )}

      {loading && !reports ? (
        <LoadingState message="Chargement des métriques…" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {kpiCards.map((card) => (
              <MetricCard key={card.label} {...card} value={card.value ?? "—"} />
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="font-bold text-[#0d0d1a]">Activité ({period} jours)</h2>
                <div className="flex gap-1">
                  {(
                    [
                      ["rides", "Courses"],
                      ["revenue", "Revenus"],
                      ["deliveries", "Livraisons"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setChartMode(mode)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                        chartMode === mode ? "bg-[#6366f1] text-white" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <BarChart
                data={chartData}
                color={chartMode === "revenue" ? "#10b981" : chartMode === "deliveries" ? "#f97316" : "#6366f1"}
                valueFormatter={chartMode === "revenue" ? (n) => formatCdf(n) : undefined}
              />
            </Card>

            <Card className="p-5">
              <h2 className="font-bold text-[#0d0d1a] mb-4">Types de véhicule</h2>
              <DonutChart data={reports?.vehicleBreakdown ?? {}} />
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-5">
              <h2 className="font-bold text-[#0d0d1a] mb-3">Opérations en direct</h2>
              <div className="space-y-2">
                {quickLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#fafaff] hover:bg-[#f0efff] transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-700">{link.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-lg font-bold text-[#6366f1] tabular-nums">{link.count}</span>
                      <span className="text-gray-400">→</span>
                    </span>
                  </Link>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="font-bold text-[#0d0d1a] mb-3">Synthèse globale</h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-xl bg-gray-50">
                  <dt className="text-gray-500 text-xs">Courses totales</dt>
                  <dd className="font-bold text-lg tabular-nums">{m.totalRides}</dd>
                </div>
                <div className="p-3 rounded-xl bg-gray-50">
                  <dt className="text-gray-500 text-xs">Complétées</dt>
                  <dd className="font-bold text-lg tabular-nums text-emerald-600">{m.completedRides}</dd>
                </div>
                <div className="p-3 rounded-xl bg-gray-50">
                  <dt className="text-gray-500 text-xs">Annulées</dt>
                  <dd className="font-bold text-lg tabular-nums text-orange-600">{m.cancelledRides}</dd>
                </div>
                <div className="p-3 rounded-xl bg-gray-50">
                  <dt className="text-gray-500 text-xs">Revenus cumulés</dt>
                  <dd className="font-bold text-sm tabular-nums">{formatCdf(m.totalRevenueCdf)}</dd>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 col-span-2">
                  <dt className="text-gray-500 text-xs mb-1">Transactions wallet aujourd&apos;hui</dt>
                  <dd className="font-bold tabular-nums">{m.walletTransactionsToday}</dd>
                </div>
              </dl>
              {reports && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge status="COMPLETED" />
                  <span className="text-xs text-gray-500 self-center">
                    Taux complétion période : {Math.round(reports.kpis.completionRate * 100)}%
                  </span>
                </div>
              )}
            </Card>
          </div>

          {reports && (
            <ReportsPanel
              reports={reports}
              onExport={() => exportReportsCsv(reports, m)}
            />
          )}
        </>
      )}
    </div>
  );
}
