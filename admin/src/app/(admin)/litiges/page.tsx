"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatDate, resolveIncident, type Incident } from "@/lib/api";
import { SosIncidentMap, SosIncidentMapPlaceholder, googleMapsUrl } from "@/components/SosIncidentMap";
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
          {incidents.map((i) => {
            const hasGps = i.lat != null && i.lng != null;
            const isSos = i.type === "SOS" || i.isEmergency;
            return (
              <Card key={i.id} className="p-4 flex flex-wrap justify-between gap-4">
                <div className="flex-1 min-w-[260px]">
                  <p className="font-medium flex items-center gap-2">
                    {isSos ? (
                      <span className="px-2 py-0.5 rounded bg-red-600 text-white text-xs font-bold">SOS</span>
                    ) : null}
                    {i.type}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">{i.description}</p>
                  {i.rideId && <p className="text-xs text-gray-500 mt-1">Course : {i.rideId}</p>}
                  {hasGps && (
                    <p className="text-xs text-gray-500 mt-1">
                      GPS : {i.lat?.toFixed(5)}, {i.lng?.toFixed(5)}
                    </p>
                  )}
                  {hasGps && (
                    <a
                      href={googleMapsUrl(i.lat!, i.lng!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#6C63FF] hover:underline mt-2"
                    >
                      Ouvrir dans Google Maps ↗
                    </a>
                  )}
                  <div className="flex gap-2 mt-2 items-center">
                    <StatusBadge status={i.status} />
                    <span className="text-xs text-gray-400">{formatDate(i.createdAt)}</span>
                  </div>
                </div>
                {isSos && (
                  <div className="w-full sm:w-72 shrink-0">
                    {hasGps ? (
                      <SosIncidentMap lat={i.lat!} lng={i.lng!} label="Alerte SOS" />
                    ) : (
                      <SosIncidentMapPlaceholder />
                    )}
                  </div>
                )}
                {i.status === "OPEN" && canWrite("litiges") && (
                  <BtnPrimary onClick={() => resolve(i.id)}>Résoudre</BtnPrimary>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
