"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, normalizeMetrics, type AdminMetrics } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

export default function DashboardPage() {
  const { canAccess } = useAdmin();
  const [metrics, setMetrics] = useState<AdminMetrics>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMetrics(await apiFetch<AdminMetrics>("/api/admin/metrics"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger les métriques");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const m = normalizeMetrics(metrics);

  const cards = [
    { label: "Utilisateurs", value: m.totalUsers, href: "/utilisateurs", section: "utilisateurs" as const },
    { label: "Chauffeurs actifs", value: m.activeDrivers, href: "/chauffeurs", section: "chauffeurs" as const },
    { label: "Courses (total)", value: m.ridesToday, href: "/courses", section: "courses" as const },
    { label: "Revenus (FC)", value: m.revenueTodayCdf.toLocaleString("fr-CD"), href: "/portefeuille", section: "portefeuille" as const },
    { label: "Litiges ouverts", value: m.openIncidents, href: "/litiges", section: "litiges" as const },
  ].filter((c) => canAccess(c.section));

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Tableau de bord" subtitle={`${m.city} · couverture nationale RDC`} />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {cards.map(({ label, value, href }) => (
            <Link key={label} href={href}>
              <Card className="p-4 hover:ring-2 hover:ring-[#6C63FF]/30 transition-shadow">
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-[#6C63FF] mt-1">{value ?? "—"}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
