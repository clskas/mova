"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchFleet, formatCdf } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";

export default function FlottePage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchFleet>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchFleet());
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de charger la flotte"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 20_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-[#1A1A2E]">Flotte propre</h2>
          <p className="text-sm text-slate-500 mt-1">Positions GPS de vos livreurs internes (rafraîchi ~20 s).</p>
        </div>
        <button type="button" onClick={() => void load()} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-slate-50">
          Actualiser
        </button>
      </div>
      {loading && <p className="text-sm text-slate-500">Chargement…</p>}
      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {data && !data.enabled && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {data.reason ?? "Activez le mode flotte propre (OWN / HYBRID) dans Paramètres."}
        </p>
      )}
      {data?.enabled && (
        <>
          <ul className="space-y-2">
            {(data.drivers ?? []).map((d) => (
              <li key={d.id} className="rounded-xl border bg-white px-4 py-3 flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-medium">{d.name || d.phone || d.driverUserId.slice(0, 8)}</p>
                  <p className="text-xs text-slate-500">{d.phone}</p>
                </div>
                <div className="text-right text-sm">
                  <p className={d.isAvailable ? "text-emerald-600 font-medium" : "text-slate-500"}>
                    {d.isAvailable ? "Disponible" : "Occupé / hors ligne"}
                  </p>
                  <p className="text-xs text-slate-400 tabular-nums">
                    {d.lat != null && d.lng != null ? `${d.lat.toFixed(4)}, ${d.lng.toFixed(4)}` : "Pas de GPS"}
                  </p>
                </div>
              </li>
            ))}
            {(data.drivers ?? []).length === 0 && (
              <p className="text-sm text-slate-600">Aucun livreur interne lié — ajoutez-en dans Paramètres.</p>
            )}
          </ul>
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Livraisons flotte (7 j)</h3>
            <ul className="space-y-1 text-sm">
              {(data.recent ?? []).map((r) => (
                <li key={String(r.id)} className="rounded-lg border px-3 py-2 flex justify-between gap-2">
                  <span className="text-slate-600">{String(r.status)}</span>
                  <span className="tabular-nums">{formatCdf(Number(r.finalPriceCdf) || undefined)}</span>
                </li>
              ))}
              {(data.recent ?? []).length === 0 && <li className="text-slate-500">Aucune livraison récente.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
