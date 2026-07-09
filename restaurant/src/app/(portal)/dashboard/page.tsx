"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRestaurantLiveRegister } from "@/components/RestaurantLiveProvider";
import { PubliciteCarousel } from "@/components/PubliciteCarousel";
import { fetchActivePublicites, fetchDashboard, formatCdf, type Publicite, type RestaurantDashboard } from "@/lib/api";

export default function DashboardPage() {
  const [data, setData] = useState<RestaurantDashboard | null>(null);
  const [publicites, setPublicites] = useState<Publicite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const [d, ads] = await Promise.all([fetchDashboard(), fetchActivePublicites("RESTAURANT")]);
      setData(d);
      setPublicites(ads);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRestaurantLiveRegister(() => load(true));

  const kpis = data?.kpis;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#1A1A2E]">Tableau de bord</h2>
          <p className="text-sm text-gray-600 mt-1">
            Vue d&apos;ensemble interactive — cliquez sur un indicateur pour accéder au détail.
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            load(true);
          }}
          className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? "Actualisation…" : "Actualiser"}
        </button>
      </div>

      {loading && <p className="text-gray-500">Chargement…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <PubliciteCarousel items={publicites} />

      {kpis && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Solde disponible" value={kpis.formattedBalance} href="/earnings" accent="from-orange-500 to-orange-600" />
            <KpiCard label="Revenus aujourd'hui" value={formatCdf(kpis.revenueTodayCdf)} href={`/earnings?from=${today}&to=${today}`} />
            <KpiCard label="Revenus ce mois" value={formatCdf(kpis.revenueMonthCdf)} href="/earnings" />
            <KpiCard label="Ventes créditées" value={String(kpis.totalSalesCount)} href="/earnings" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Nouvelles commandes" value={kpis.pendingOrders} href="/?status=PENDING" color="text-orange-700" />
            <StatCard label="En préparation" value={kpis.activeOrders} href="/" color="text-violet-700" />
            <StatCard
              label="Livrées aujourd'hui"
              value={kpis.deliveredTodayCount}
              sub={formatCdf(kpis.deliveredTodayGrossCdf)}
              href={`/?status=DELIVERED&from=${today}&to=${today}`}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/" className="px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-medium hover:bg-orange-700">
              Voir les commandes
            </Link>
            <Link href="/earnings" className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">
              Rapport financier
            </Link>
            <Link href="/menu" className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">
              Gérer le menu
            </Link>
          </div>

          {data.recentOrders.length > 0 && (
            <section>
              <h3 className="font-medium text-[#1A1A2E] mb-3">Dernières commandes</h3>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white overflow-hidden">
                {data.recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link href="/" className="px-4 py-3 flex items-center justify-between gap-4 text-sm hover:bg-orange-50 transition block">
                      <div>
                        <p className="font-medium">#{o.id.slice(0, 8)}</p>
                        <p className="text-xs text-gray-500">{o.statusLabel ?? o.status}</p>
                      </div>
                      <span className="font-medium text-[#6C63FF]">{formatCdf(o.estimatedPriceCdf)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, href, accent }: { label: string; value: string; href: string; accent?: string }) {
  const inner = accent ? (
    <div className={`rounded-2xl bg-gradient-to-br ${accent} text-white p-5 shadow-md h-full`}>
      <p className="text-xs opacity-90">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  ) : (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm h-full hover:border-orange-300 hover:shadow-md transition">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1 text-[#1A1A2E]">{value}</p>
    </div>
  );
  return (
    <Link href={href} className="block hover:scale-[1.02] transition-transform">
      {inner}
    </Link>
  );
}

function StatCard({ label, value, sub, href, color }: { label: string; value: number; sub?: string; href: string; color?: string }) {
  return (
    <Link href={href} className="block hover:scale-[1.02] transition-transform">
      <div className="rounded-xl border border-gray-100 bg-white p-4 hover:border-orange-200 hover:shadow-md transition h-full">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-3xl font-bold mt-1 ${color ?? "text-[#1A1A2E]"}`}>{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </div>
    </Link>
  );
}
