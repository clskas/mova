"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatCdf, type DeliveryOverview } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { Card, EmptyState, ErrorBanner, LoadingState, PageHeader, StatusBadge } from "@/components/ui";

export default function LivraisonsPage() {
  const { canWrite } = useAdmin();
  const [deliveries, setDeliveries] = useState<DeliveryOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<DeliveryOverview[]>("/api/admin/deliveries");
      setDeliveries(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Livraisons" subtitle="Colis, repas et express en cours" />
      {!canWrite("livraisons") && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 mb-4">
          Accès lecture seule pour votre rôle.
        </p>
      )}
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : deliveries.length === 0 ? (
        <EmptyState message="Aucune livraison" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Type</th>
                <th className="p-3">Trajet / Restaurant</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Prix</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{d.type ?? "—"}</td>
                  <td className="p-3">
                    {d.type === "FOOD" ? d.restaurantName : `${d.pickupAddress ?? "—"} → ${d.dropoffAddress ?? "—"}`}
                  </td>
                  <td className="p-3"><StatusBadge status={d.status} /></td>
                  <td className="p-3 text-[#6C63FF]">{formatCdf(d.priceCdf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
