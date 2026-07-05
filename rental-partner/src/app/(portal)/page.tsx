"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePartnerLiveRegister } from "@/components/PartnerLiveProvider";
import { fetchProfile } from "@/lib/api";

export default function DashboardPage() {
  const [profile, setProfile] = useState<{
    name?: string;
    vehicleCounts?: { pending?: number; approved?: number; rejected?: number };
    pendingBookings?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const p = await fetchProfile();
      setProfile(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  usePartnerLiveRegister(load);

  const cards = [
    {
      href: "/vehicules",
      title: "Mes véhicules",
      desc: "Ajouter, modifier ou retirer des véhicules du catalogue.",
      stat: profile?.vehicleCounts
        ? `${profile.vehicleCounts.approved ?? 0} publié(s) · ${profile.vehicleCounts.pending ?? 0} en attente`
        : "Gérer la flotte",
      cta: "Ouvrir le catalogue",
      accent: "bg-indigo-600 hover:bg-indigo-700",
    },
    {
      href: "/reservations",
      title: "Réservations",
      desc: "Confirmer les demandes, suivre les locations et encaisser en espèces.",
      stat:
        (profile?.pendingBookings ?? 0) > 0
          ? `${profile?.pendingBookings} en attente de confirmation`
          : "Suivi en temps réel",
      cta: "Voir les réservations",
      accent: "bg-emerald-600 hover:bg-emerald-700",
    },
    {
      href: "/promos",
      title: "Codes promo",
      desc: "Créer des remises valables uniquement sur vos véhicules.",
      stat: "Promotions location",
      cta: "Gérer les codes",
      accent: "bg-violet-600 hover:bg-violet-700",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-[#1A1A2E]">Tableau de bord</h2>
        <p className="text-sm text-gray-500 mt-1">
          Bienvenue{profile?.name ? `, ${profile.name}` : ""}. Gérez votre activité location depuis ce portail.
        </p>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
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
      )}

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-medium text-indigo-900">Inscrire un nouveau véhicule</p>
          <p className="text-sm text-indigo-700 mt-1">Soumettez un dossier pour validation MOVA sous 48 h.</p>
        </div>
        <Link
          href="/vehicules/nouveau"
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          + Ajouter un véhicule
        </Link>
      </div>

      {(profile?.pendingBookings ?? 0) > 0 && (
        <Link
          href="/reservations"
          className="block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          {profile?.pendingBookings} réservation(s) nécessitent votre attention →
        </Link>
      )}
    </div>
  );
}
