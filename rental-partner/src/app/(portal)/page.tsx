"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "@/components/PortalShell";
import { fetchProfile, fetchVehicles, formatCdf, mediaUrl, type PartnerVehicle } from "@/lib/api";

function statusBadge(v: PartnerVehicle) {
  if (v.approvalStatus === "PENDING") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">En attente MOVA</span>;
  }
  if (v.approvalStatus === "REJECTED") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">Refusé</span>;
  }
  if (v.isActive !== false) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">Publié</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Inactif</span>;
}

export default function VehiclesPage() {
  const [profile, setProfile] = useState<{ name?: string; pendingBookings?: number } | null>(null);
  const [vehicles, setVehicles] = useState<PartnerVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, list] = await Promise.all([fetchProfile(), fetchVehicles()]);
      setProfile(p);
      setVehicles(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PortalShell partnerName={profile?.name}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Mes véhicules</h2>
            <p className="text-sm text-gray-500">Soumis au catalogue MOVA après validation admin.</p>
          </div>
          <Link
            href="/nouveau"
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            + Inscrire un véhicule
          </Link>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}

        {(profile?.pendingBookings ?? 0) > 0 && (
          <Link
            href="/reservations"
            className="block rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 hover:bg-indigo-100"
          >
            {profile?.pendingBookings} réservation(s) en attente de votre confirmation →
          </Link>
        )}

        {loading ? (
          <p className="text-gray-500">Chargement…</p>
        ) : vehicles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-gray-600 mb-4">Aucun véhicule inscrit pour le moment.</p>
            <Link href="/nouveau" className="text-indigo-600 font-medium hover:underline">
              Soumettre votre premier véhicule →
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {vehicles.map((v) => {
              const thumb = mediaUrl(v.imageUrl);
              return (
                <li key={v.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-4">
                  {thumb ? (
                    <img src={thumb} alt="" className="w-24 h-20 object-cover rounded-xl shrink-0" />
                  ) : (
                    <div className="w-24 h-20 rounded-xl bg-gray-100 shrink-0 flex items-center justify-center text-2xl">
                      🚗
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <h3 className="font-semibold">{v.name}</h3>
                      {statusBadge(v)}
                    </div>
                    <p className="text-sm text-gray-500">
                      {v.categoryLabel ?? v.category} · {v.city ?? "Kinshasa"} · {formatCdf(v.dailyRateCdf)}/j
                    </p>
                    {v.approvalStatus === "PENDING" && (
                      <p className="text-xs text-amber-700 mt-2">L&apos;équipe MOVA examine votre dossier sous 48 h.</p>
                    )}
                    {v.approvalStatus === "REJECTED" && (
                      <p className="text-xs text-red-700 mt-2">Refusé — modifiez et resoumettez pour une nouvelle validation.</p>
                    )}
                    {(v.approvalStatus === "PENDING" || v.approvalStatus === "REJECTED") && (
                      <Link
                        href={`/nouveau?id=${v.id}`}
                        className="inline-block mt-2 text-sm text-indigo-600 font-medium hover:underline"
                      >
                        Modifier →
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PortalShell>
  );
}
