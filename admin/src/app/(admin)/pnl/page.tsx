"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchPnl, formatCdf, MOVA_CITIES } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { downloadCsv } from "@/lib/export-csv";
import {
  inclusiveDays,
  rangeForPresetDays,
  todayYmdKinshasa,
  type PeriodMode,
  type PeriodPresetDays,
} from "@/lib/period-filter";
import { BtnGhost, BtnPrimary, ErrorBanner, LoadingState, PageHeader, SelectInput } from "@/components/ui";

export default function PnlPage() {
  const { role, user } = useAdmin();
  const lockedCity = role === "CITY_ADMIN" ? user?.managedCity?.trim() || "" : "";
  const [city, setCity] = useState(lockedCity);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("preset");
  const [period, setPeriod] = useState<PeriodPresetDays>(30);
  const [customFrom, setCustomFrom] = useState(() => rangeForPresetDays(30).from);
  const [customTo, setCustomTo] = useState(todayYmdKinshasa);
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null);
  const [appliedTo, setAppliedTo] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPnl>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    if (periodMode === "custom" && appliedFrom && appliedTo) {
      return {
        days: inclusiveDays(appliedFrom, appliedTo),
        from: appliedFrom,
        to: appliedTo,
        label: `${appliedFrom} → ${appliedTo}`,
      };
    }
    const r = rangeForPresetDays(period);
    return {
      days: period,
      from: r.from,
      to: r.to,
      label: period === 1 ? "aujourd'hui" : `${period}j`,
    };
  }, [periodMode, period, appliedFrom, appliedTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await fetchPnl({
          days: query.days,
          from: query.from,
          to: query.to,
          city: lockedCity || city || null,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur P&L");
    } finally {
      setLoading(false);
    }
  }, [query, city, lockedCity]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `senga-pnl-${query.days}j.csv`,
      ["Indicateur", "Valeur"],
      [
        ["Revenus CDF", data.revenueCdf],
        ["Commission plateforme", data.platformCommissionCdf],
        ["Revenus courses", data.rideRevenueCdf],
        ["Revenus livraisons", data.deliveryRevenueCdf],
        ["Marge nette estimée", data.estimatedNetMarginCdf],
        ["Ticket moyen", data.avgTicketCdf],
        ["Courses terminées", data.completedRides],
        ["Annulations", data.cancelledRides],
      ],
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="P&L / commissions"
        subtitle={`Période ${query.label}${lockedCity || city ? ` · ${lockedCity || city}` : " · national"}`}
        action={
          <div className="flex flex-wrap gap-2">
            <BtnGhost onClick={exportCsv} disabled={!data}>Export CSV</BtnGhost>
            <BtnPrimary onClick={() => void load()}>Actualiser</BtnPrimary>
          </div>
        }
      />
      <div className="flex flex-wrap gap-3 items-end">
        {!lockedCity && (
          <label className="flex flex-col gap-0.5 min-w-[11rem]">
            <span className="text-[11px] font-medium text-gray-500 px-0.5">Ville</span>
            <SelectInput
              value={city}
              onChange={setCity}
              options={[{ value: "", label: "Toutes les villes" }, ...MOVA_CITIES.map((c) => ({ value: c, label: c }))]}
            />
          </label>
        )}
        <PeriodFilterBar
          mode={periodMode}
          period={period}
          customFrom={customFrom}
          customTo={customTo}
          appliedFrom={appliedFrom}
          appliedTo={appliedTo}
          onModeChange={(m) => {
            setPeriodMode(m);
            if (m !== "custom") {
              setAppliedFrom(null);
              setAppliedTo(null);
            }
          }}
          onPeriodChange={setPeriod}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
          onApplyCustom={() => {
            if (!customFrom || !customTo || customFrom > customTo) return;
            setAppliedFrom(customFrom);
            setAppliedTo(customTo);
            setPeriodMode("custom");
          }}
        />
      </div>
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading || !data ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <MetricCard label="Revenus" value={formatCdf(data.revenueCdf)} accent="violet" />
          <MetricCard label="Commission plateforme" value={formatCdf(data.platformCommissionCdf)} accent="green" />
          <MetricCard label="Marge nette estimée" value={formatCdf(data.estimatedNetMarginCdf)} accent="midnight" />
          <MetricCard label="Courses" value={formatCdf(data.rideRevenueCdf)} hint={`${data.completedRides} terminées`} accent="violet" />
          <MetricCard label="Livraisons" value={formatCdf(data.deliveryRevenueCdf)} accent="orange" />
          <MetricCard label="Ticket moyen" value={formatCdf(data.avgTicketCdf)} hint={`${data.completionRate}% complétion`} accent="green" />
        </div>
      )}
    </div>
  );
}
