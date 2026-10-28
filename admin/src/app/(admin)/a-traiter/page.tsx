"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchOpsInbox, type OpsInboxItem } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { BtnGhost, Card, EmptyState, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

export default function ATraiterPage() {
  const { role, user } = useAdmin();
  const city = role === "CITY_ADMIN" ? user?.managedCity?.trim() || "" : "";
  const [items, setItems] = useState<OpsInboxItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOpsInbox(city || null);
      setItems(res.items ?? []);
      setCounts(res.counts ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger la file");
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="À traiter"
        subtitle={city ? `File ops · ${city}` : "File ops unifiée (KYC, SOS, litiges, docs, fraude)"}
        action={<BtnGhost onClick={() => void load()}>Actualiser</BtnGhost>}
      />
      {error && <ErrorBanner message={error} onRetry={load} />}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Total" value={loading ? "…" : counts.total ?? 0} accent="midnight" />
        <MetricCard label="SOS" value={loading ? "…" : counts.sos ?? 0} accent="red" href="/litiges" />
        <MetricCard label="KYC" value={loading ? "…" : counts.kyc ?? 0} accent="orange" href="/kyc" />
        <MetricCard label="Litiges" value={loading ? "…" : counts.litiges ?? 0} accent="orange" href="/litiges" />
        <MetricCard label="Docs / PIN" value={loading ? "…" : counts.docs ?? 0} accent="violet" href="/chauffeurs" />
        <MetricCard label="Fraude" value={loading ? "…" : counts.fraude ?? 0} accent="red" href="/fraude" />
      </div>
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Rien à traiter pour le moment" />
      ) : (
        <Card className="divide-y">
          {items.map((it) => (
            <Link
              key={it.id}
              href={it.href}
              className="flex items-start justify-between gap-3 p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{it.kind}</p>
                <p className="font-medium text-[#1A1A2E] mt-0.5">{it.title}</p>
                <p className="text-sm text-gray-500 truncate">{it.subtitle}</p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">P{it.priority}</span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
