"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  apiFetch,
  exportReportsCsv,
  fetchAdminReports,
  formatCdf,
  MOVA_CITIES,
  normalizeMetrics,
  type AdminMetrics,
  type AdminReports,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { BarChart } from "@/components/dashboard/BarChart";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ReportsPanel } from "@/components/dashboard/ReportsPanel";
import { ConnectionCard } from "@/components/ConnectionCard";
import { Card, ErrorBanner, LoadingState, PageHeader, SelectInput, StatusBadge } from "@/components/ui";

type PeriodPreset = 1 | 7 | 30 | 90;
type PeriodMode = "preset" | "custom";
type ChartMode = "rides" | "revenue" | "deliveries";

function todayYmdKinshasa(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kinshasa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function inclusiveDays(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00+01:00`);
  const b = Date.parse(`${to}T12:00:00+01:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 30;
  return Math.max(1, Math.floor((b - a) / 86_400_000) + 1);
}

const PERIOD_PRESETS: { days: PeriodPreset; label: string }[] = [
  { days: 1, label: "Auj." },
  { days: 7, label: "7j" },
  { days: 30, label: "30j" },
  { days: 90, label: "90j" },
];

export default function DashboardPage() {
  const { canAccess, role, user } = useAdmin();
  const [metrics, setMetrics] = useState<AdminMetrics>({});
  const [reports, setReports] = useState<AdminReports | null>(null);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("preset");
  const [period, setPeriod] = useState<PeriodPreset>(30);
  const [customFrom, setCustomFrom] = useState(() => {
    const to = todayYmdKinshasa();
    const d = new Date(`${to}T12:00:00+01:00`);
    d.setDate(d.getDate() - 29);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Kinshasa",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  });
  const [customTo, setCustomTo] = useState(todayYmdKinshasa);
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null);
  const [appliedTo, setAppliedTo] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState("");
  const [chartMode, setChartMode] = useState<ChartMode>("rides");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  /** Ignore les réponses obsolètes quand ville + période changent vite. */
  const loadSeq = useRef(0);

  const scopedCity = role === "CITY_ADMIN" ? (user?.managedCity?.trim() || "") : cityFilter;

  const periodLabel = useMemo(() => {
    if (periodMode === "custom" && appliedFrom && appliedTo) {
      return `${appliedFrom} → ${appliedTo}`;
    }
    if (period === 1) return "aujourd'hui";
    return `${period}j`;
  }, [periodMode, period, appliedFrom, appliedTo]);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const cityAtRequest = scopedCity;
    const modeAtRequest = periodMode;
    const periodAtRequest = period;
    const fromAtRequest = modeAtRequest === "custom" ? appliedFrom : null;
    const toAtRequest = modeAtRequest === "custom" ? appliedTo : null;
    const daysAtRequest =
      fromAtRequest && toAtRequest ? inclusiveDays(fromAtRequest, toAtRequest) : periodAtRequest;
    setError(null);
    try {
      const metricsQs = new URLSearchParams();
      if (cityAtRequest) metricsQs.set("city", cityAtRequest);
      metricsQs.set("days", String(daysAtRequest));
      if (fromAtRequest && toAtRequest) {
        metricsQs.set("from", fromAtRequest);
        metricsQs.set("to", toAtRequest);
      }
      const metricsPath = `/api/admin/metrics?${metricsQs}`;
      const [mRes, rRes] = await Promise.allSettled([
        apiFetch<AdminMetrics>(metricsPath),
        fetchAdminReports({
          days: daysAtRequest,
          city: cityAtRequest || null,
          from: fromAtRequest,
          to: toAtRequest,
        }),
      ]);
      if (seq !== loadSeq.current) return;
      if (mRes.status === "fulfilled") {
        setMetrics(mRes.value);
      }
      // Ne pas garder un rapport d’une autre ville / période si le fetch échoue.
      if (rRes.status === "fulfilled") {
        const payload = rRes.value;
        const payloadCity = (payload.city ?? "").trim().toLowerCase();
        const wantedCity = cityAtRequest.trim().toLowerCase();
        const cityOk = !wantedCity || payloadCity === wantedCity;
        const periodOk =
          fromAtRequest && toAtRequest
            ? (!payload.periodFrom || payload.periodFrom === fromAtRequest) &&
              (!payload.periodTo || payload.periodTo === toAtRequest)
            : !payload.periodDays || payload.periodDays === periodAtRequest;
        if (cityOk && periodOk) {
          setReports(payload);
        } else {
          // Réponse désynchronisée (proxy / cache) — ne pas afficher de mauvais croisement.
          setReports(null);
          setError("Filtres ville / période incohérents — réessayez Actualiser.");
        }
      } else {
        setReports(null);
      }
      const parts: string[] = [];
      if (mRes.status === "rejected") {
        parts.push(mRes.reason instanceof Error ? mRes.reason.message : "Métriques indisponibles");
      }
      if (rRes.status === "rejected") {
        parts.push(rRes.reason instanceof Error ? rRes.reason.message : "Rapports indisponibles");
      }
      if (parts.length) setError(parts.join(" · "));
      if (mRes.status === "fulfilled" || rRes.status === "fulfilled") {
        setLastUpdate(new Date());
      }
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(e instanceof Error ? e.message : "Impossible de charger le tableau de bord");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [period, periodMode, appliedFrom, appliedTo, scopedCity]);

  useEffect(() => {
    setLoading(true);
    setReports(null);
    setMetrics({});
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      void load();
    }, 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const m = useMemo(() => {
    const base = normalizeMetrics(metrics);
    const kpis = reports?.kpis;
    const cityLabel = scopedCity || "RDC";
    if (!kpis) return { ...base, city: cityLabel };
    return {
      ...base,
      totalRides: kpis.totalRides ?? base.totalRides,
      completedRides: kpis.completedRides ?? base.completedRides,
      cancelledRides: kpis.cancelledRides ?? base.cancelledRides,
      totalRevenueCdf: kpis.totalRevenueCdf ?? base.totalRevenueCdf,
      city: cityLabel,
    };
  }, [metrics, reports, scopedCity]);

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
    return reports.daily.map((d) => ({
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
    {
      label: "À traiter",
      value: "→",
      hint: scopedCity ? `file ops ${scopedCity}` : "file ops nationale",
      href: "/a-traiter",
      section: "inbox" as const,
      accent: "orange" as const,
    },
    {
      label: "Utilisateurs",
      value: m.totalUsers,
      // Stock ville (tous comptes liés) — la période Auj./7j/… ne filtre pas ce compteur.
      hint: scopedCity
        ? `stock ${scopedCity} · ${m.passengers} passager${m.passengers === 1 ? "" : "s"} · hors période`
        : "stock national · hors période",
      href: scopedCity ? `/utilisateurs?city=${encodeURIComponent(scopedCity)}` : "/utilisateurs",
      section: "utilisateurs" as const,
      accent: "midnight" as const,
    },
    {
      label: "Nouveaux inscrits",
      value: m.newUsersInPeriod,
      hint: `créés · période ${periodLabel}`,
      href: scopedCity ? `/utilisateurs?city=${encodeURIComponent(scopedCity)}` : "/utilisateurs",
      section: "utilisateurs" as const,
      accent: "violet" as const,
    },
    {
      label: "Carte flotte",
      value: "GPS",
      hint: "temps réel 15 s",
      href: "/carte",
      section: "carte" as const,
      accent: "green" as const,
    },
    {
      label: "Chauffeurs en ligne",
      value: m.availableDrivers,
      hint: `${m.approvedDrivers} approuvés · temps réel`,
      href: "/chauffeurs",
      section: "chauffeurs" as const,
      accent: "green" as const,
    },
    {
      label: "KYC en attente",
      value: m.pendingKyc,
      hint: "temps réel",
      href: "/kyc",
      section: "kyc" as const,
      accent: "orange" as const,
    },
    {
      label: "Courses actives",
      value: m.activeRides,
      hint: `${m.ridesToday ?? 0} créées aujourd'hui · temps réel`,
      href: "/courses",
      section: "courses" as const,
      accent: "violet" as const,
      sparkline: rideSpark,
    },
    {
      label: "Livraisons actives",
      value: m.activeDeliveries,
      hint: "temps réel",
      href: "/livraisons",
      section: "livraisons" as const,
      accent: "green" as const,
    },
    {
      label: "Revenus du jour",
      value: formatCdf(m.revenueTodayCdf),
      hint: `${m.todayCompleted} courses · calendrier jour`,
      href: "/portefeuille",
      section: "portefeuille" as const,
      accent: "violet" as const,
      sparkline: revenueSpark,
    },
    { label: "Litiges ouverts", value: m.openIncidents, hint: "temps réel", href: "/litiges", section: "litiges" as const, accent: "orange" as const },
    { label: "Alertes SOS", value: m.sosIncidents, hint: "temps réel", href: "/litiges", section: "litiges" as const, accent: "red" as const },
    { label: "Solde wallets", value: formatCdf(m.walletBalanceCdf), hint: `${m.walletCount} comptes · temps réel`, href: "/portefeuille", section: "portefeuille" as const, accent: "midnight" as const },
    {
      label: "Planifiées",
      value: m.scheduledRides,
      hint: `période ${periodLabel}`,
      href: "/planifiees",
      section: "planifiees" as const,
      accent: "violet" as const,
    },
    {
      label: "Déménagements",
      value: m.movingRequests,
      hint: `période ${periodLabel}`,
      href: "/demenagements",
      section: "demenagements" as const,
      accent: "orange" as const,
    },
    {
      label: "Covoiturage",
      value: m.carpoolTrips,
      hint: `période ${periodLabel}`,
      href: "/covoiturage",
      section: "covoiturage" as const,
      accent: "green" as const,
    },
  ].filter((c) => {
    if (!canAccess(c.section)) return false;
    // Admin ville : pas de KPI portefeuille national (wallets cross-ville).
    if (role === "CITY_ADMIN" && c.section === "portefeuille") {
      return false;
    }
    return true;
  });

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
        subtitle={`${scopedCity || "RDC"} · ${scopedCity ? `filtre ${scopedCity}` : "couverture nationale"} · ${periodLabel} · ${lastUpdate ? `MAJ ${lastUpdate.toLocaleTimeString("fr-CD")}` : ""}`}
        action={
          <div className="flex flex-wrap items-end gap-2 relative z-10">
            {role !== "CITY_ADMIN" && (
              <label className="min-w-[11rem] flex flex-col gap-0.5">
                <span className="text-[11px] font-medium text-gray-500 px-0.5">Ville</span>
                <SelectInput
                  value={cityFilter}
                  onChange={(v) => {
                    setCityFilter(v);
                    setMetrics({});
                    setReports(null);
                    setLoading(true);
                    setError(null);
                  }}
                  options={[
                    { value: "", label: "Toutes les villes" },
                    ...MOVA_CITIES.map((c) => ({ value: c, label: c })),
                  ]}
                />
              </label>
            )}
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-gray-500 px-0.5">Période</span>
              <div className="flex flex-wrap gap-1">
                {PERIOD_PRESETS.map(({ days, label }) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => {
                      setPeriodMode("preset");
                      setAppliedFrom(null);
                      setAppliedTo(null);
                      if (periodMode === "preset" && days === period) return;
                      setPeriod(days);
                      setMetrics({});
                      setReports(null);
                      setLoading(true);
                      setError(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      periodMode === "preset" && period === days
                        ? "bg-[#6366f1] text-white"
                        : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPeriodMode("custom");
                    setError(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    periodMode === "custom"
                      ? "bg-[#6366f1] text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Perso
                </button>
              </div>
            </div>
            {periodMode === "custom" && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-gray-500 px-0.5">Du</span>
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo || todayYmdKinshasa()}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-gray-500 px-0.5">Au</span>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom || undefined}
                    max={todayYmdKinshasa()}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!customFrom || !customTo) {
                      setError("Choisissez une date de début et une date de fin.");
                      return;
                    }
                    if (customFrom > customTo) {
                      setError("La date de début doit être antérieure ou égale à la date de fin.");
                      return;
                    }
                    if (inclusiveDays(customFrom, customTo) > 366) {
                      setError("La période personnalisée est limitée à 366 jours.");
                      return;
                    }
                    setAppliedFrom(customFrom);
                    setAppliedTo(customTo);
                    setMetrics({});
                    setReports(null);
                    setLoading(true);
                    setError(null);
                  }}
                  className="mova-btn-primary text-sm"
                >
                  Appliquer
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                autoRefresh ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500"
              }`}
            >
              {autoRefresh ? "Auto 60s" : "Manuel"}
            </button>
            <button type="button" onClick={() => { setLoading(true); void load(); }} className="mova-btn-primary text-sm">
              Actualiser
            </button>
          </div>
        }
      />
      {scopedCity ? (
        <p className="text-sm text-[#6366f1] -mt-3">
          Filtre ville : <strong>{scopedCity}</strong>
          {typeof m.totalUsers === "number"
            ? ` · ${m.totalUsers} utilisateur${m.totalUsers === 1 ? "" : "s"} (stock lié à la ville, pas les inscriptions ${periodLabel})`
            : null}
          {" · "}période activité : <strong>{periodLabel}</strong>
        </p>
      ) : null}

      <ConnectionCard />

      {error && (
        <div className="mb-2">
          <ErrorBanner message={error} onRetry={load} />
        </div>
      )}

      {loading && !reports ? (
        <LoadingState message="Chargement des métriques…" />
      ) : (
        <>
          {scopedCity && reports && reports.kpis.totalRides === 0 && reports.kpis.totalDeliveries === 0 ? (
            <Card className="p-4 border border-amber-100 bg-amber-50/70 text-sm text-amber-950">
              Aucune activité enregistrée à <strong>{scopedCity}</strong> sur la période <strong>{periodLabel}</strong>.
              Essayez une autre période ou vérifiez que les courses de cette ville ont un GPS de prise en charge.
            </Card>
          ) : null}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {kpiCards.map((card) => (
              <MetricCard key={card.label} {...card} value={card.value ?? "—"} />
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="font-bold text-[#0d0d1a]">Activité ({periodLabel})</h2>
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
                  <dt className="text-gray-500 text-xs">Courses ({periodLabel})</dt>
                  <dd className="font-bold text-lg tabular-nums">{m.totalRides}</dd>
                </div>
                <div className="p-3 rounded-xl bg-gray-50">
                  <dt className="text-gray-500 text-xs">Complétées ({periodLabel})</dt>
                  <dd className="font-bold text-lg tabular-nums text-emerald-600">{m.completedRides}</dd>
                </div>
                <div className="p-3 rounded-xl bg-gray-50">
                  <dt className="text-gray-500 text-xs">Annulées ({periodLabel})</dt>
                  <dd className="font-bold text-lg tabular-nums text-orange-600">{m.cancelledRides}</dd>
                </div>
                <div className="p-3 rounded-xl bg-gray-50">
                  <dt className="text-gray-500 text-xs">Revenus ({periodLabel})</dt>
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
