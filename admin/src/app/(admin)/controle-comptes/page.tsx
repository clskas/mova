"use client";

import { useCallback, useEffect, useState } from "react";
import { getMoneyControlLatest, runMoneyControl, type MoneyControlRun } from "@/lib/api";
import { BtnPrimary, Card, EmptyState, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

const KIND_LABELS: Record<string, string> = {
  WALLET_BALANCE: "Solde de portefeuille",
  WALLET_HELD: "Montant bloqué (séquestre)",
  JOB_BALANCE: "Équilibre d'une commande",
  JOB_SHARE: "Part d'un bénéficiaire",
};

const TYPE_LABELS: Record<string, string> = {
  RIDE: "Course",
  RIDE_SHARE: "Course Pool",
  SCHEDULED: "Course planifiée",
  DELIVERY: "Livraison",
  ERRAND: "Courses & commissions",
  MOVING: "Déménagement",
  RENTAL: "Location",
  CARPOOL: "Covoiturage",
};

const fmt = (n: number) => `${n.toLocaleString("fr-FR")} FC`;

/** Nightly money control: read-only report of anything that does not add up. */
export default function MoneyControlPage() {
  const [run, setRun] = useState<MoneyControlRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getMoneyControlLatest()
      .then((r) => setRun(r && typeof r === "object" && "id" in r ? r : null))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Chargement impossible"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await runMoneyControl();
      if (r && "id" in r) setRun(r);
      else load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Contrôle impossible");
    } finally {
      setBusy(false);
    }
  };

  const anomalies = (run?.anomalies ?? []).filter((a) => a.severity !== "INFO");
  const infos = (run?.anomalies ?? []).filter((a) => a.severity === "INFO");

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Contrôle des comptes"
        subtitle="Chaque nuit, SENGA vérifie que l'argent s'équilibre : soldes des portefeuilles, commandes payées et part de chacun. Ce contrôle ne déplace jamais d'argent."
        action={
          <BtnPrimary onClick={() => void runNow()} disabled={busy}>
            {busy ? "Contrôle en cours…" : "Lancer le contrôle maintenant"}
          </BtnPrimary>
        }
      />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState label="Chargement du dernier contrôle…" />
      ) : !run ? (
        <EmptyState message="Aucun contrôle encore effectué. Le premier aura lieu cette nuit, ou lancez-le maintenant." />
      ) : (
        <>
          <Card className="p-4 space-y-1 text-sm">
            <p>
              Dernier contrôle : <strong>{new Date(run.startedAt).toLocaleString("fr-FR")}</strong>
            </p>
            <p>
              {run.checkedWallets} portefeuilles et {run.checkedJobs} commandes payées (dernières 48 h) vérifiés.
            </p>
            {anomalies.length === 0 ? (
              <p className="text-green-700 font-medium">✔ Aucune anomalie : tout s&apos;équilibre.</p>
            ) : (
              <p className="text-red-700 font-medium">⚠ {anomalies.length} anomalie(s) à vérifier.</p>
            )}
          </Card>

          {anomalies.length > 0 && (
            <Card className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Gravité</th>
                    <th className="px-3 py-2">Contrôle</th>
                    <th className="px-3 py-2">Concerne</th>
                    <th className="px-3 py-2">Attendu</th>
                    <th className="px-3 py-2">Constaté</th>
                    <th className="px-3 py-2">Écart</th>
                    <th className="px-3 py-2">Explication</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.map((a, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            a.severity === "HIGH" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {a.severity === "HIGH" ? "Élevée" : "Moyenne"}
                        </span>
                      </td>
                      <td className="px-3 py-2">{KIND_LABELS[a.kind] ?? a.kind}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {a.referenceType ? `${TYPE_LABELS[a.referenceType] ?? a.referenceType} ${a.referenceId ?? ""}` : `Utilisateur ${a.userId ?? ""}`}
                      </td>
                      <td className="px-3 py-2">{fmt(a.expectedCdf)}</td>
                      <td className="px-3 py-2">{fmt(a.actualCdf)}</td>
                      <td className={`px-3 py-2 font-medium ${a.differenceCdf < 0 ? "text-red-700" : "text-amber-700"}`}>
                        {a.differenceCdf > 0 ? "+" : ""}
                        {fmt(a.differenceCdf)}
                      </td>
                      <td className="px-3 py-2">{a.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {infos.length > 0 && (
            <Card className="p-4 text-sm space-y-1">
              <p className="font-medium">Pour information ({infos.length})</p>
              <ul className="list-disc pl-5 text-gray-700">
                {infos.map((a, i) => (
                  <li key={i}>
                    {TYPE_LABELS[a.referenceType ?? ""] ?? a.referenceType} {a.referenceId} — {a.message} ({fmt(a.expectedCdf)})
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
