"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPnl, formatCdf, MOVA_CITIES } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { downloadCsv } from "@/lib/export-csv";
import { BtnGhost, BtnPrimary, ErrorBanner, LoadingState, PageHeader, SelectInput } from "@/components/ui";

export default function PnlPage() {
  const { role, user } = useAdmin();
  const lockedCity = role === "CITY_ADMIN" ? user?.managedCity?.trim() || "" : "";
  const [city, setCity] = useState(lockedCity);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPnl>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchPnl({ days, city: lockedCity || city || null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur P&L");
    } finally {
      setLoading(false);
    }
  }, [days, city, lockedCity]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `senga-pnl-${days}j.csv`,
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
        subtitle={`Période ${days}j${lockedCity || city ? ` · ${lockedCity || city}` : " · national"}`}
        action={
          <div className="flex flex-wrap gap-2">
            <BtnGhost onClick={exportCsv} disabled={!data}>Export CSV</BtnGhost>
            <BtnPrimary onClick={() => void load()}>Actualiser</BtnPrimary>
          </div>
        }
      />
      <div className="flex flex-wrap gap-3">
        {!lockedCity && (
          <SelectInput
            value={city}
            onChange={setCity}
            options={[{ value: "", label: "Toutes les villes" }, ...MOVA_CITIES.map((c) => ({ value: c, label: c }))]}
          />
        )}
        <SelectInput
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={[
            { value: "7", label: "7 jours" },
            { value: "30", label: "30 jours" },
            { value: "90", label: "90 jours" },
          ]}
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
