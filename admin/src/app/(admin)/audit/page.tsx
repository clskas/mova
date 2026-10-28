"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuditLog } from "@/lib/api";
import { downloadCsv } from "@/lib/export-csv";
import { BtnGhost, Card, EmptyState, ErrorBanner, LoadingState, PageHeader, TextInput } from "@/components/ui";

export default function AuditPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchAuditLog>>["data"]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAuditLog({ take: 100, action: action.trim() || undefined });
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur audit");
    } finally {
      setLoading(false);
    }
  }, [action]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="Journal d’audit"
        subtitle={`${total} événement(s)`}
        action={
          <BtnGhost
            onClick={() =>
              downloadCsv(
                "senga-audit.csv",
                ["Date", "Acteur", "Action", "Ressource", "Id"],
                rows.map((r) => [r.createdAt, r.actorUserId, r.action, r.resourceType, r.resourceId ?? ""]),
              )
            }
            disabled={rows.length === 0}
          >
            Export CSV
          </BtnGhost>
        }
      />
      <div className="flex gap-2">
        <TextInput value={action} onChange={setAction} placeholder="Filtrer par action…" />
        <BtnGhost onClick={() => void load()}>Filtrer</BtnGhost>
      </div>
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState message="Aucun événement" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Date</th>
                <th className="p-3">Acteur</th>
                <th className="p-3">Action</th>
                <th className="p-3">Ressource</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3 text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString("fr-FR")}</td>
                  <td className="p-3 font-mono text-xs">{r.actorUserId.slice(0, 8)}…</td>
                  <td className="p-3">{r.action}</td>
                  <td className="p-3 text-xs">
                    {r.resourceType}
                    {r.resourceId ? ` · ${r.resourceId.slice(0, 8)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
