"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatDate, resolveIncident, type Incident } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnPrimary,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/ui";

export default function LitigesPage() {
  const { canWrite } = useAdmin();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Incident[]>("/api/admin/incidents");
      setIncidents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: string) {
    try {
      await resolveIncident(id, "RESOLVED");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec résolution");
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Litiges" subtitle="Incidents et réclamations utilisateurs" />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : incidents.length === 0 ? (
        <EmptyState message="Aucun litige" />
      ) : (
        <div className="space-y-3">
          {incidents.map((i) => (
            <Card key={i.id} className="p-4 flex flex-wrap justify-between gap-4">
              <div>
                <p className="font-medium flex items-center gap-2">
                  {i.type === "SOS" || i.isEmergency ? (
                    <span className="px-2 py-0.5 rounded bg-red-600 text-white text-xs font-bold">SOS</span>
                  ) : null}
                  {i.type}
                </p>
                <p className="text-sm text-gray-600 mt-1">{i.description}</p>
                {i.rideId && <p className="text-xs text-gray-500 mt-1">Course : {i.rideId}</p>}
                {(i.lat != null && i.lng != null) && (
                  <p className="text-xs text-gray-500">GPS : {i.lat?.toFixed(5)}, {i.lng?.toFixed(5)}</p>
                )}
                <div className="flex gap-2 mt-2 items-center">
                  <StatusBadge status={i.status} />
                  <span className="text-xs text-gray-400">{formatDate(i.createdAt)}</span>
                </div>
              </div>
              {i.status === "OPEN" && canWrite("litiges") && (
                <BtnPrimary onClick={() => resolve(i.id)}>Résoudre</BtnPrimary>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
