"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatCdf, formatDate, type ScheduledOverview } from "@/lib/api";
import { Card, EmptyState, ErrorBanner, LoadingState, PageHeader, StatusBadge } from "@/components/ui";

export default function PlanifieesPage() {
  const [scheduled, setScheduled] = useState<ScheduledOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ScheduledOverview[]>("/api/admin/scheduled-rides");
      setScheduled(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Courses planifiées" subtitle="Réservations à l'avance" />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : scheduled.length === 0 ? (
        <EmptyState message="Aucune course planifiée" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Trajet</th>
                <th className="p-3">Date prévue</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Prix</th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map((s) => (
                <tr key={s.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{s.pickupAddress ?? "—"} → {s.dropoffAddress ?? "—"}</td>
                  <td className="p-3 text-gray-500">{formatDate(s.scheduledAt)}</td>
                  <td className="p-3"><StatusBadge status={s.status} /></td>
                  <td className="p-3 text-[#6C63FF]">{formatCdf(s.priceCdf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
