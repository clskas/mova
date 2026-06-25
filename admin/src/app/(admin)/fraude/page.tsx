"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  createFraudIncident,
  fetchFraudAlerts,
  formatDate,
  type FraudAlert,
  type FraudAlertsResponse,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnPrimary,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  SelectInput,
} from "@/components/ui";

const PERIODS = [
  { value: "7", label: "7 jours" },
  { value: "30", label: "30 jours" },
  { value: "90", label: "90 jours" },
];

function severityBadge(severity: FraudAlert["severity"]) {
  const map: Record<FraudAlert["severity"], string> = {
    HIGH: "bg-red-600 text-white",
    MEDIUM: "bg-amber-500 text-white",
    LOW: "bg-gray-200 text-gray-700",
  };
  const label: Record<FraudAlert["severity"], string> = {
    HIGH: "Risque élevé",
    MEDIUM: "À surveiller",
    LOW: "Faible",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${map[severity]}`}>{label[severity]}</span>;
}

function SummaryStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="p-4">
      <p className={`text-2xl font-semibold ${accent ?? "text-gray-900"}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </Card>
  );
}

export default function FraudePage() {
  const { canWrite } = useAdmin();
  const writable = canWrite("fraude");
  const [days, setDays] = useState("30");
  const [data, setData] = useState<FraudAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFraudAlerts(Number(days), writable);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [days, writable]);

  useEffect(() => {
    load();
  }, [load]);

  async function openIncident(alert: FraudAlert) {
    setCreating(`${alert.entityType}:${alert.entityId}`);
    try {
      await createFraudIncident(alert);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec création incident");
    } finally {
      setCreating(null);
    }
  }

  const profileHref = (alert: FraudAlert) =>
    alert.entityType === "DRIVER" ? `/chauffeurs?focus=${alert.entityId}` : `/utilisateurs?focus=${alert.entityId}`;

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Fraude / Anti-contournement"
        subtitle="Détection automatique des comportements suspects : annulations hors app, binômes récurrents, paiements non validés"
        action={
          <div className="w-40">
            <SelectInput value={days} onChange={setDays} options={PERIODS} />
          </div>
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        <LoadingState />
      ) : !data ? (
        <EmptyState message="Aucune donnée" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            <SummaryStat label="Alertes" value={data.summary.totalAlerts} />
            <SummaryStat label="Risque élevé" value={data.summary.highSeverity} accent="text-red-600" />
            <SummaryStat label="Annulations hors app" value={data.summary.cancellationsAfterAccept} accent="text-amber-600" />
            <SummaryStat label="Binômes récurrents" value={data.summary.recurringPairs} accent="text-amber-600" />
            <SummaryStat label="Impayés" value={data.summary.unpaidCompleted} accent="text-amber-600" />
            <SummaryStat label="Incidents créés" value={data.summary.incidentsCreated} accent="text-[#6C63FF]" />
          </div>

          <p className="text-xs text-gray-400 mb-3">
            Période : {data.periodDays} jours · Généré le {formatDate(data.generatedAt)} · Seuil incident auto : score ≥ {data.autoIncidentThreshold}
          </p>

          {data.alerts.length === 0 ? (
            <EmptyState message="Aucun comportement suspect détecté sur la période" />
          ) : (
            <div className="space-y-3">
              {data.alerts.map((alert) => {
                const key = `${alert.entityType}:${alert.entityId}`;
                return (
                  <Card key={key} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex-1 min-w-[280px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          {severityBadge(alert.severity)}
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                            {alert.entityType === "DRIVER" ? "Chauffeur/livreur" : "Client"}
                          </span>
                          <span className="text-xs text-gray-500">Score</span>
                          <span className="text-sm font-bold text-gray-900">{alert.score}</span>
                          {alert.incidentCreated && (
                            <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                              Incident ouvert
                            </span>
                          )}
                        </div>
                        <Link href={profileHref(alert)} className="inline-block mt-2 text-sm text-[#6C63FF] hover:underline font-medium">
                          {alert.entityType === "DRIVER" ? "Chauffeur" : "Utilisateur"} {alert.entityId} ↗
                        </Link>
                        <ul className="mt-2 space-y-1">
                          {alert.reasons.map((reason, i) => (
                            <li key={i} className="text-sm text-gray-600 flex gap-2">
                              <span className="text-amber-500">•</span>
                              {reason}
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
                          <span>Annulations : {alert.cancellationsAfterAccept}</span>
                          <span>Binômes : {alert.recurringPairs}</span>
                          <span>Impayés : {alert.unpaidCompleted}</span>
                          {alert.counterpartIds.length > 0 && (
                            <span>En lien avec : {alert.counterpartIds.join(", ")}</span>
                          )}
                        </div>
                        {alert.sampleRideIds.length > 0 && (
                          <p className="text-xs text-gray-400 mt-1">
                            Courses : {alert.sampleRideIds.join(", ")}
                          </p>
                        )}
                      </div>
                      {writable && !alert.incidentCreated && (
                        <BtnPrimary onClick={() => openIncident(alert)} disabled={creating === key}>
                          {creating === key ? "Création…" : "Ouvrir un litige"}
                        </BtnPrimary>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
