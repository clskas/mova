"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createFraudIncident,
  dismissFraudAlert,
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
  const router = useRouter();
  const { canWrite } = useAdmin();
  const writable = canWrite("fraude");
  const [days, setDays] = useState("30");
  const [data, setData] = useState<FraudAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [showReviewed, setShowReviewed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Viewing never opens disputes: each alert is decided by an admin.
      const res = await fetchFraudAlerts(Number(days));
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [days]);

  async function dismiss(alert: FraudAlert) {
    // Cancel = do nothing; OK (even empty) = classify as false positive.
    const comment = window.prompt("Classer en faux positif — pourquoi ? (facultatif, visible dans le suivi)");
    if (comment === null) return;
    const key = `${alert.entityType}:${alert.entityId}`;
    setCreating(key);
    setError(null);
    setSuccess(null);
    try {
      const res = await dismissFraudAlert(alert, comment || undefined);
      setSuccess(res.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Classement impossible");
    } finally {
      setCreating(null);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  async function openIncident(alert: FraudAlert) {
    const key = `${alert.entityType}:${alert.entityId}`;
    setCreating(key);
    setError(null);
    setSuccess(null);
    try {
      const result = await createFraudIncident(alert);
      if (result.created || result.alreadyExists) {
        setSuccess(result.message);
        router.push("/litiges");
        return;
      }
      setError(result.message || "Échec création du litige");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec création du litige");
    } finally {
      setCreating(null);
    }
  }

  const profileHref = (alert: FraudAlert) =>
    alert.entityType === "DRIVER" ? `/chauffeurs?focus=${alert.entityId}` : `/utilisateurs?focus=${alert.entityId}`;
  const sampleHref = (s: { id: string; serviceType: "RIDE" | "DELIVERY" }) =>
    s.serviceType === "DELIVERY" ? `/livraisons?id=${s.id}` : `/courses?id=${s.id}`;
  const activeAlerts = data?.alerts.filter((a) => !a.reviewed) ?? [];
  const reviewedAlerts = data?.alerts.filter((a) => a.reviewed) ?? [];

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Fraude / Anti-contournement"
        subtitle="Comportements suspects sur les courses et livraisons : annulations tardives, binômes récurrents, impayés de plus de 24 h. Les personnes signalées ne sont jamais prévenues."
        action={
          <div className="w-40">
            <SelectInput value={days} onChange={setDays} options={PERIODS} />
          </div>
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} />}
      {success && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

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
            <SummaryStat label="Litiges ouverts" value={data.summary.incidentsCreated} accent="text-[#6C63FF]" />
          </div>

          <p className="text-xs text-gray-400 mb-3">
            Période : {data.periodDays} jours · Généré le {formatDate(data.generatedAt)} · Risque élevé : score ≥ {data.autoIncidentThreshold}
            {data.summary.testAccountsExcluded ? ` · ${data.summary.testAccountsExcluded} signal(aux) de comptes de test ignoré(s)` : ""}
          </p>

          {activeAlerts.length === 0 ? (
            <EmptyState message="Aucun comportement suspect à examiner sur la période" />
          ) : (
            <div className="space-y-3">
              {activeAlerts.map((alert) => {
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
                        <p className="mt-2 text-sm flex flex-wrap items-center gap-x-3">
                          <Link href={profileHref(alert)} className="text-[#6C63FF] hover:underline font-medium">
                            {alert.entityName || (alert.entityType === "DRIVER" ? "Chauffeur" : "Client")} ↗
                          </Link>
                          {alert.entityPhone && (
                            <a href={`tel:${alert.entityPhone}`} className="text-xs text-gray-600 hover:underline">
                              📞 {alert.entityPhone}
                            </a>
                          )}
                        </p>
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
                          {(alert.counterparts?.length ?? 0) > 0 && (
                            <span>
                              En lien avec :{" "}
                              {alert.counterparts!.map((c, idx) => (
                                <span key={c.id}>
                                  {idx > 0 ? ", " : ""}
                                  <Link href={`/utilisateurs?focus=${c.id}`} className="text-[#6C63FF] hover:underline">
                                    {c.name || c.phone || "compte"}
                                  </Link>
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                        {(alert.samples?.length ?? 0) > 0 && (
                          <p className="text-xs text-gray-400 mt-1">
                            Exemples :{" "}
                            {alert.samples!.map((s, idx) => (
                              <span key={s.id}>
                                {idx > 0 ? " · " : ""}
                                <Link href={sampleHref(s)} className="text-[#6C63FF] hover:underline">
                                  {s.serviceType === "DELIVERY" ? "livraison" : "course"} {s.id.slice(0, 8)}
                                </Link>
                              </span>
                            ))}
                          </p>
                        )}
                        {alert.review && alert.review.status !== "OPEN" && (
                          <p className="text-xs text-gray-500 mt-1">
                            Dernier examen : {formatDate(alert.review.resolvedAt ?? undefined)}
                            {alert.review.outcome ? ` — ${alert.review.outcome}` : ""}
                          </p>
                        )}
                      </div>
                      {alert.incidentCreated ? (
                        <Link
                          href="/litiges"
                          className="inline-flex items-center justify-center rounded-xl bg-[#6C63FF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5a52e0]"
                        >
                          Voir le litige
                        </Link>
                      ) : writable ? (
                        <div className="flex flex-col gap-2">
                          <BtnPrimary onClick={() => openIncident(alert)} disabled={creating === key}>
                            {creating === key ? "…" : "Ouvrir un litige"}
                          </BtnPrimary>
                          <button
                            type="button"
                            onClick={() => void dismiss(alert)}
                            disabled={creating === key}
                            className="text-xs rounded-lg border px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Faux positif
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {reviewedAlerts.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowReviewed((v) => !v)}
                className="text-sm text-gray-600 hover:underline"
              >
                {showReviewed ? "▾" : "▸"} Déjà examinés, sans nouveau signal ({reviewedAlerts.length})
              </button>
              {showReviewed && (
                <div className="mt-2 space-y-2">
                  {reviewedAlerts.map((alert) => (
                    <Card key={`${alert.entityType}:${alert.entityId}`} className="p-3 text-sm flex flex-wrap justify-between gap-2">
                      <span>
                        <Link href={profileHref(alert)} className="text-[#6C63FF] hover:underline">
                          {alert.entityName || alert.entityId}
                        </Link>{" "}
                        · score {alert.score}
                      </span>
                      <span className="text-xs text-gray-500">
                        Examiné le {formatDate(alert.review?.resolvedAt ?? undefined)}
                        {alert.review?.outcome ? ` — ${alert.review.outcome}` : ""}
                      </span>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
