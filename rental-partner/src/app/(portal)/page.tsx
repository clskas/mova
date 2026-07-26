"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePartnerLiveRegister } from "@/components/PartnerLiveProvider";
import { PubliciteCarousel } from "@/components/PubliciteCarousel";
import { fetchActivePublicites, fetchDashboard, fetchProfile, formatCdf, formatDate, type Publicite, type RentalDashboard } from "@/lib/api";

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<RentalDashboard | null>(null);
  const [publicites, setPublicites] = useState<Publicite[]>([]);
  const [profileName, setProfileName] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      const [d, p, ads] = await Promise.all([fetchDashboard(), fetchProfile(), fetchActivePublicites("RENTAL_PARTNER")]);
      setDashboard(d);
      setProfileName(p.name ?? d.partnerName);
      setPublicites(ads);
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  usePartnerLiveRegister(() => load(true));

  const kpis = dashboard?.kpis;

  const cards = [
    {
      href: "/vehicules",
      title: "Mes véhicules",
      desc: "Ajouter, modifier ou retirer des véhicules du catalogue.",
      stat: kpis?.vehicleCounts
        ? `${kpis.vehicleCounts.approved ?? 0} publié(s) · ${kpis.vehicleCounts.pending ?? 0} en attente`
        : "Gérer la flotte",
      cta: "Ouvrir le catalogue",
      accent: "bg-indigo-600 hover:bg-indigo-700",
    },
    {
      href: "/reservations",
      title: "Réservations",
      desc: "Confirmer les demandes, suivre les locations et encaisser en espèces.",
      stat:
        (kpis?.pendingBookings ?? 0) > 0
          ? `${kpis?.pendingBookings} en attente de confirmation`
          : `${kpis?.activeBookings ?? 0} location(s) en cours`,
      cta: "Voir les réservations",
      accent: "bg-emerald-600 hover:bg-emerald-700",
    },
    {
      href: "/revenus",
      title: "Revenus",
      desc: "Solde, rapports financiers, export CSV/PDF et impression.",
      stat: kpis ? `Solde ${kpis.formattedBalance}` : "Rapports financiers",
      cta: "Voir les revenus",
      accent: "bg-violet-600 hover:bg-violet-700",
    },
    {
      href: "/promos",
      title: "Codes promo",
      desc: "Créer des remises valables uniquement sur vos véhicules.",
      stat: "Promotions location",
      cta: "Gérer les codes",
      accent: "bg-slate-600 hover:bg-slate-700",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[#1A1A2E]">Tableau de bord</h2>
          <p className="text-sm text-gray-500 mt-1">
            Bienvenue{profileName ? `, ${profileName}` : ""}. Cliquez sur un indicateur pour accéder au détail.
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            load();
          }}
          className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? "Actualisation…" : "Actualiser"}
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement…</p>
      ) : (
        <>
          <PubliciteCarousel items={publicites} />

          {kpis && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link href="/revenus" className="block hover:scale-[1.02] transition-transform">
                <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white p-5 shadow-md h-full">
                  <p className="text-xs opacity-90">Solde disponible</p>
                  <p className="text-2xl font-bold mt-1">{kpis.formattedBalance}</p>
                </div>
              </Link>
              <Link href="/revenus" className="block hover:scale-[1.02] transition-transform">
                <Kpi label="Revenus aujourd'hui" value={formatCdf(kpis.revenueTodayCdf)} />
              </Link>
              <Link href="/revenus" className="block hover:scale-[1.02] transition-transform">
                <Kpi label="Revenus ce mois" value={formatCdf(kpis.revenueMonthCdf)} />
              </Link>
              <Link href="/reservations?status=RETURNED" className="block hover:scale-[1.02] transition-transform">
                <Kpi label="Locations terminées (mois)" value={String(kpis.completedMonthCount)} />
              </Link>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col hover:border-indigo-200 hover:shadow-md transition"
              >
                <h3 className="font-semibold text-lg">{card.title}</h3>
                <p className="text-sm text-gray-500 mt-1 flex-1">{card.desc}</p>
                <p className="text-xs text-indigo-700 mt-3 font-medium">{card.stat}</p>
                <span className={`mt-4 inline-flex justify-center px-4 py-2 rounded-xl text-white text-sm font-medium ${card.accent}`}>
                  {card.cta}
                </span>
              </Link>
            ))}
          </div>

          {dashboard && dashboard.recentBookings.length > 0 && (
            <section>
              <h3 className="font-medium mb-3">Dernières réservations</h3>
              <ul className="divide-y divide-gray-100 rounded-xl border bg-white overflow-hidden">
                {dashboard.recentBookings.map((b) => (
                  <li key={b.id}>
                    <Link href="/reservations" className="px-4 py-3 flex justify-between gap-4 text-sm hover:bg-indigo-50 transition block">
                      <div>
                        <p className="font-medium">{b.vehicleName ?? "Véhicule"}</p>
                        <p className="text-xs text-gray-500">{formatDate(b.startDate)} → {formatDate(b.endDate)}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 self-start">{b.statusLabel ?? b.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-medium text-indigo-900">Inscrire un nouveau véhicule</p>
          <p className="text-sm text-indigo-700 mt-1">Soumettez un dossier pour validation SENGA sous 48 h.</p>
        </div>
        <Link
          href="/vehicules/nouveau"
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          + Ajouter un véhicule
        </Link>
      </div>

      {(kpis?.pendingBookings ?? 0) > 0 && (
        <Link
          href="/reservations"
          className="block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          {kpis?.pendingBookings} réservation(s) nécessitent votre attention →
        </Link>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm h-full hover:border-indigo-300 hover:shadow-md transition">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1 text-[#1A1A2E]">{value}</p>
    </div>
  );
}
