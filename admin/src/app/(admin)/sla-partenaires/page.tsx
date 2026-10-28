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

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="SLA partenaires"
        subtitle="Annulations, notes et volume (30 j)"
        action={
          <BtnGhost
            onClick={() =>
              data &&
              downloadCsv(
                "senga-sla-partenaires.csv",
                ["Nom", "Type", "Note", "Commandes", "Annulés", "Taux %", "Alerte"],
                data.partners.map((p) => [
                  p.name ?? "",
                  p.commerceType ?? "",
                  p.rating ?? "",
                  p.orders,
                  p.cancelled,
                  p.cancelRate,
                  p.alert ? "oui" : "",
                ]),
              )
            }
            disabled={!data?.partners.length}
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
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <MetricCard label="Partenaires" value={data?.counts.total ?? "…"} accent="orange" />
        <MetricCard label="Hors SLA" value={data?.counts.alerts ?? "…"} accent="red" />
      </div>
      {loading ? (
        <LoadingState />
      ) : !data?.partners.length ? (
        <EmptyState message="Aucun partenaire" />
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
    </div>
  );
}
