"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRestaurantLiveRegister } from "@/components/RestaurantLiveProvider";
import { PubliciteCarousel } from "@/components/PubliciteCarousel";
import { fetchActivePublicites, fetchDashboard, formatCdf, type Publicite, type RestaurantDashboard } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";
import { PartnerAmountLine } from "@/components/PartnerAmountLine";
import { useCommerceCopy } from "@/components/CommerceTypeContext";

export default function DashboardPage() {
  const copy = useCommerceCopy();
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
      setError(toUserErrorMessage(e, "Erreur de chargement"));
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
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bonjour";
    if (hour < 18) return "Bon après-midi";
    return "Bonsoir";
  }, []);

  const pending = kpis?.pendingOrders ?? 0;
  const active = kpis?.activeOrders ?? 0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--mova-border)] bg-white shadow-[var(--mova-shadow-sm)]">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "linear-gradient(135deg, rgba(232,93,44,0.12) 0%, rgba(255,248,243,0.95) 42%, #fff 100%)",
          }}
          aria-hidden
        />
        <div className="relative p-5 sm:p-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
              Accueil partenaire
            </p>
            <h2 className="mt-1 text-2xl sm:text-[1.75rem] font-semibold tracking-tight text-[#0f1222]">
              {greeting}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 max-w-md leading-relaxed">
              Pilotage de votre {copy.storeNoun} — commandes, caisse et catalogue au même endroit.
            </p>
            {(pending > 0 || active > 0) && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand)] ring-1 ring-[var(--brand-ring)]/50">
                {pending > 0 ? `${pending} nouvelle${pending > 1 ? "s" : ""}` : null}
                {pending > 0 && active > 0 ? " · " : null}
                {active > 0 ? `${active} en préparation` : null}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={pending > 0 ? "/?status=PENDING" : "/"}
              className="inline-flex items-center justify-center min-h-11 px-4 rounded-xl bg-[var(--brand)] text-white text-sm font-semibold hover:brightness-95 transition"
            >
              {pending > 0 ? "Traiter les commandes" : "Voir les commandes"}
            </Link>
            <button
              type="button"
              disabled={refreshing}
              onClick={() => {
                setRefreshing(true);
                load(true);
              }}
              className="inline-flex items-center justify-center min-h-11 px-4 rounded-xl border border-[var(--mova-border)] bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {refreshing ? "Actualisation…" : "Actualiser"}
            </button>
          </div>
        </div>
      </section>

      {loading && <p className="text-slate-500 text-sm">Chargement du tableau de bord…</p>}
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <PubliciteCarousel items={publicites} />

      {kpis && (
        <>
          {kpis.walletAvailable === false && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {kpis.walletMessage ??
                "Portefeuille temporairement indisponible. En attente de configuration du hub de paiement."}
            </div>
          )}

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#0f1222]">Caisse</h3>
              <Link href="/earnings" className="text-xs font-semibold text-[var(--brand)] hover:underline">
                Rapport financier
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Solde disponible"
                value={kpis.formattedBalance}
                href="/earnings"
                featured
              />
              <KpiCard
                label="Revenus aujourd'hui"
                value={formatCdf(kpis.revenueTodayCdf)}
                href={`/earnings?from=${today}&to=${today}`}
              />
              <KpiCard label="Revenus ce mois" value={formatCdf(kpis.revenueMonthCdf)} href="/earnings" />
              <KpiCard label="Ventes créditées" value={String(kpis.totalSalesCount)} href="/earnings" />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#0f1222]">Activité du jour</h3>
              <Link href="/" className="text-xs font-semibold text-[var(--brand)] hover:underline">
                Toutes les commandes
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Nouvelles commandes"
                value={kpis.pendingOrders}
                href="/?status=PENDING"
                tone="brand"
              />
              <StatCard label="En préparation" value={kpis.activeOrders} href="/" tone="slate" />
              <StatCard
                label="Livrées aujourd'hui"
                value={kpis.deliveredTodayCount}
                sub={formatCdf(kpis.deliveredTodayGrossCdf)}
                href={`/?status=DELIVERED&from=${today}&to=${today}`}
                tone="emerald"
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[#0f1222]">Raccourcis</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <QuickLink href="/" label="Commandes" hint="Préparer & suivre" />
              <QuickLink href={copy.catalogHref} label={copy.catalogNoun} hint={`Gérer les ${copy.itemNounPlural}`} />
              <QuickLink href="/earnings" label="Revenus" hint="Soldes & retraits" />
              <QuickLink href="/aide" label="Aide" hint="Manuel partenaire" />
            </div>
          </section>

          {data.recentOrders.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[#0f1222]">Dernières commandes</h3>
              <ul className="divide-y divide-slate-100 rounded-2xl border border-[var(--mova-border)] bg-white overflow-hidden shadow-[var(--mova-shadow-sm)]">
                {data.recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link
                      href="/"
                      className="px-4 py-3.5 flex items-center justify-between gap-4 text-sm hover:bg-[var(--brand-soft)]/60 transition"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#0f1222] tabular-nums">#{o.id.slice(0, 8)}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{o.statusLabel ?? o.status}</p>
                      </div>
                      <PartnerAmountLine
                        subtotalCdf={o.itemsSubtotalCdf}
                        partnerNetCdf={o.partnerNetCdf}
                        partnerDiscountCdf={o.partnerDiscountCdf}
                        promoCode={o.promoCode}
                      />
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

function KpiCard({
  label,
  value,
  href,
  featured,
}: {
  label: string;
  value: string;
  href: string;
  featured?: boolean;
}) {
  return (
    <Link href={href} className="group block h-full">
      <div
        className={`h-full rounded-2xl p-4 sm:p-5 transition shadow-[var(--mova-shadow-sm)] ${
          featured
            ? "bg-gradient-to-br from-[#e85d2c] to-[#c2410c] text-white"
            : "bg-white border border-[var(--mova-border)] group-hover:border-[var(--brand-ring)]"
        }`}
      >
        <p className={`text-[11px] font-medium uppercase tracking-wide ${featured ? "text-white/85" : "text-slate-500"}`}>
          {label}
        </p>
        <p className={`mt-2 text-xl sm:text-2xl font-semibold tabular-nums tracking-tight ${featured ? "text-white" : "text-[#0f1222]"}`}>
          {value}
        </p>
      </div>
    </Link>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  href: string;
  tone: "brand" | "slate" | "emerald";
}) {
  const toneClass =
    tone === "brand" ? "text-[var(--brand)]" : tone === "emerald" ? "text-emerald-700" : "text-[#0f1222]";
  return (
    <Link href={href} className="group block h-full">
      <div className="h-full rounded-2xl border border-[var(--mova-border)] bg-white p-4 shadow-[var(--mova-shadow-sm)] group-hover:border-[var(--brand-ring)] transition">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1.5 text-3xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
        {sub ? <p className="text-xs text-slate-500 mt-1">{sub}</p> : null}
      </div>
    </Link>
  );
}

function QuickLink({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-[var(--mova-border)] bg-white px-3.5 py-3.5 shadow-[var(--mova-shadow-sm)] hover:border-[var(--brand-ring)] hover:bg-[var(--brand-soft)]/40 transition"
    >
      <p className="text-sm font-semibold text-[#0f1222]">{label}</p>
      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{hint}</p>
    </Link>
  );
}
