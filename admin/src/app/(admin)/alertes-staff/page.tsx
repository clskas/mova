"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  evaluateStaffAlerts,
  fetchStaffAlerts,
  markAllStaffAlertsRead,
  markStaffAlertRead,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { BtnGhost, BtnPrimary, Card, EmptyState, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

export default function AlertesStaffPage() {
  const { role, user } = useAdmin();
  const city = role === "CITY_ADMIN" ? user?.managedCity?.trim() || "" : "";
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchStaffAlerts>>["data"]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStaffAlerts({ city: city || undefined });
      setRows(res.data ?? []);
      setUnread(res.unread ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur alertes");
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PageHeader
        title="Alertes staff"
        subtitle="Inbox ops (docs, KYC, SOS, SLA)"
        action={
          <div className="flex flex-wrap gap-2">
            <BtnGhost
              onClick={async () => {
                await evaluateStaffAlerts(city || null);
                await load();
              }}
            >
              Évaluer règles
            </BtnGhost>
            <BtnPrimary
              onClick={async () => {
                await markAllStaffAlertsRead();
                await load();
              }}
            >
              Tout marquer lu
            </BtnPrimary>
          </div>
        }
      />
      <MetricCard label="Non lues" value={unread} accent="orange" />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState message="Aucune alerte" />
      ) : (
        <Card className="divide-y">
          {rows.map((r) => (
            <div key={r.id} className={`p-4 ${r.readAt ? "opacity-60" : ""}`}>
              <div className="flex justify-between gap-2">
                <p className="text-xs font-medium uppercase text-gray-500">{r.severity}</p>
                <p className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleString("fr-FR")}</p>
              </div>
              <p className="font-medium mt-1">{r.title}</p>
              <p className="text-sm text-gray-600">{r.body}</p>
              <div className="mt-2 flex gap-2">
                {r.href && (
                  <Link href={r.href} className="text-sm text-[#6C63FF] hover:underline">
                    Ouvrir
                  </Link>
                )}
                {!r.readAt && (
                  <button
                    type="button"
                    className="text-sm text-gray-500 hover:underline"
                    onClick={async () => {
                      await markStaffAlertRead(r.id);
                      await load();
                    }}
                  >
                    Marquer lu
                  </button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
