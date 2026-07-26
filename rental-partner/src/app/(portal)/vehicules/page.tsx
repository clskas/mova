"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePartnerLiveRegister } from "@/components/PartnerLiveProvider";
import {
  deleteVehicle,
  fetchVehicles,
  formatCdf,
  mediaUrl,
  type PartnerVehicle,
} from "@/lib/api";

function statusBadge(v: PartnerVehicle) {
  if (v.isActive === false) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Retiré</span>;
  }
  if (v.approvalStatus === "PENDING") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">En attente SENGA</span>;
  }
  if (v.approvalStatus === "REJECTED") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">Refusé</span>;
  }
  if (v.approvalStatus === "APPROVED") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">Publié</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Inactif</span>;
}

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<PartnerVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filterQ, setFilterQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCity, setFilterCity] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchVehicles({
        q: filterQ.trim() || undefined,
        status: filterStatus || undefined,
        city: filterCity.trim() || undefined,
      });
      setVehicles(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger vos véhicules.");
    } finally {
      setLoading(false);
    }
  }, [filterQ, filterStatus, filterCity]);

  useEffect(() => {
    load();
  }, [load]);

  usePartnerLiveRegister(load);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Retirer « ${name} » du catalogue ?`)) return;
    setBusyId(id);
    setError(null);
    try {
      await deleteVehicle(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Mes véhicules</h2>
          <p className="text-sm text-gray-500">Catalogue partenaire — modifications visibles en temps réel après validation SENGA.</p>
        </div>
        <Link
          href="/vehicules/nouveau"
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-sm"
        >
          + Ajouter un véhicule
        </Link>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Rechercher (marque, modèle…)"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
          />
          <select
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Tous statuts</option>
            <option value="PENDING">En attente SENGA</option>
            <option value="APPROVED">Publié</option>
            <option value="REJECTED">Refusé</option>
          </select>
          <input
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Ville"
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
          />
        </div>
        <button type="button" onClick={() => { setLoading(true); load(); }} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm">
          Filtrer
        </button>
      </section>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Chargement…</p>
      ) : vehicles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-gray-600 mb-4">Aucun véhicule inscrit pour le moment.</p>
          <Link
            href="/vehicules/nouveau"
            className="inline-flex px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            Soumettre votre premier véhicule
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-600">
                  <th className="px-4 py-3 font-medium">Véhicule</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Tarifs</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vehicles.map((v) => {
                  const thumb = mediaUrl(v.imageUrl);
                  const canDelete = v.isActive !== false;
                  const rateLabel =
                    v.hourlyRateCdf != null && v.hourlyRateCdf > 0
                      ? `${formatCdf(v.dailyRateCdf)}/j · ${formatCdf(v.hourlyRateCdf)}/h`
                      : `${formatCdf(v.dailyRateCdf)}/j`;
                  return (
                    <tr key={v.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {thumb ? (
                            <img src={thumb} alt="" className="w-14 h-11 object-cover rounded-lg shrink-0" />
                          ) : (
                            <div className="w-14 h-11 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-lg">
                              🚗
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-[#1A1A2E]">{v.name}</p>
                            <p className="text-xs text-gray-500">
                              {v.categoryLabel ?? v.category} · {v.city ?? "Kinshasa"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-gray-700">{rateLabel}</td>
                      <td className="px-4 py-3">{statusBadge(v)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Link
                            href={`/vehicules/nouveau?id=${v.id}`}
                            className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100"
                          >
                            Modifier
                          </Link>
                          {canDelete && (
                            <button
                              type="button"
                              disabled={busyId === v.id}
                              onClick={() => handleDelete(v.id, v.name)}
                              className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 font-medium hover:bg-red-100 disabled:opacity-50"
                            >
                              {busyId === v.id ? "…" : "Retirer"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
