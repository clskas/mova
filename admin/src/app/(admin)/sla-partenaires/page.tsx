"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPartnerSla, MOVA_CITIES } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { downloadCsv } from "@/lib/export-csv";
import { BtnGhost, Card, EmptyState, ErrorBanner, LoadingState, PageHeader, SelectInput } from "@/components/ui";

export default function SlaPartenairesPage() {
  const { role, user } = useAdmin();
  const lockedCity = role === "CITY_ADMIN" ? user?.managedCity?.trim() || "" : "";
  const [city, setCity] = useState(lockedCity);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPartnerSla>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchPartnerSla(lockedCity || city || null, 30));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur SLA");
    } finally {
      setLoading(false);
    }
  }, [city, lockedCity]);

  useEffect(() => {
    void load();
  }, [load]);

  const rentalPartners = data?.rentalPartners ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="SLA partenaires"
        subtitle="Commerce + location (30 j)"
        action={
          <BtnGhost
            onClick={() => {
              if (!data) return;
              downloadCsv(
                "senga-sla-partenaires.csv",
                ["Segment", "Nom", "Type", "Note", "Volume", "Annul/Clos %", "Alerte"],
                [
                  ...data.partners.map((p) => [
                    "COMMERCE",
                    p.name ?? "",
                    p.commerceType ?? "",
                    p.rating ?? "",
                    p.orders,
                    p.cancelRate,
                    p.alert ? "oui" : "",
                  ]),
                  ...rentalPartners.map((p) => [
                    "LOCATION",
                    p.name ?? "",
                    "RENTAL",
                    "",
                    p.bookings,
                    p.declineRate,
                    p.alert ? "oui" : "",
                  ]),
                ],
              );
            }}
            disabled={!data?.partners.length && !rentalPartners.length}
          >
            Export CSV
          </BtnGhost>
        }
      />
      {!lockedCity && (
        <SelectInput
          value={city}
          onChange={setCity}
          options={[{ value: "", label: "Toutes les villes" }, ...MOVA_CITIES.map((c) => ({ value: c, label: c }))]}
        />
      )}
      {error && <ErrorBanner message={error} onRetry={load} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Commerce" value={data?.counts.total ?? "…"} accent="orange" />
        <MetricCard label="Hors SLA commerce" value={data?.counts.alerts ?? "…"} accent="red" />
        <MetricCard label="Loueurs" value={data?.counts.rentalTotal ?? "…"} accent="violet" />
        <MetricCard label="Hors SLA location" value={data?.counts.rentalAlerts ?? "…"} accent="red" />
      </div>
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <h3 className="text-sm font-semibold text-gray-700">Commerce</h3>
          {!data?.partners.length ? (
            <EmptyState message="Aucun partenaire commerce" />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Nom</th>
                    <th className="p-3">Note</th>
                    <th className="p-3">Commandes</th>
                    <th className="p-3">Annul. %</th>
                    <th className="p-3">Alerte</th>
                  </tr>
                </thead>
                <tbody>
                  {data.partners.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3">{p.rating ?? "—"}</td>
                      <td className="p-3">{p.orders}</td>
                      <td className="p-3">{p.cancelRate}%</td>
                      <td className="p-3">{p.alert ? <span className="text-red-700 text-xs font-medium">Oui</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <h3 className="text-sm font-semibold text-gray-700 pt-2">Location</h3>
          {!rentalPartners.length ? (
            <EmptyState message="Aucun loueur" />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Nom</th>
                    <th className="p-3">Ville</th>
                    <th className="p-3">Réservations</th>
                    <th className="p-3">Clos %</th>
                    <th className="p-3">Alerte</th>
                  </tr>
                </thead>
                <tbody>
                  {rentalPartners.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3">{p.city ?? "—"}</td>
                      <td className="p-3">{p.bookings}</td>
                      <td className="p-3">{p.declineRate}%</td>
                      <td className="p-3">{p.alert ? <span className="text-red-700 text-xs font-medium">Oui</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
