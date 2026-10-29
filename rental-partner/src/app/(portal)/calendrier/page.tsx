"use client";

import { useCallback, useEffect, useState } from "react";
import { createCalendarBlock, deleteCalendarBlock, fetchCalendar } from "@/lib/api";
import { rangeForPresetDays } from "@/lib/period-filter";

export default function CalendrierPage() {
  const range = rangeForPresetDays(30);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchCalendar>> | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [startDate, setStartDate] = useState(range.from);
  const [endDate, setEndDate] = useState(range.to);
  const [reason, setReason] = useState("Maintenance");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const cal = await fetchCalendar({ from: range.from, to: range.to });
      setData(cal);
      setVehicleId((v) => v || cal.vehicles[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur calendrier");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addBlock() {
    if (!vehicleId || !startDate || !endDate) return;
    await createCalendarBlock({ vehicleId, startDate, endDate, reason });
    await load();
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-[#1A1A2E]">Calendrier</h2>
        <p className="text-sm text-gray-500 mt-1">
          Réservations et blocages · {range.from} → {range.to}
        </p>
      </div>
      {loading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold">Bloquer un véhicule</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-sm">
            Véhicule
            <select
              className="block mt-0.5 border rounded-lg px-2 py-1.5"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              {(data?.vehicles ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Du
            <input type="date" className="block mt-0.5 border rounded-lg px-2 py-1.5" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="text-sm">
            Au
            <input type="date" className="block mt-0.5 border rounded-lg px-2 py-1.5" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label className="text-sm">
            Motif
            <input className="block mt-0.5 border rounded-lg px-2 py-1.5" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="button" onClick={() => void addBlock()} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm">
            Ajouter
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <h3 className="text-sm font-semibold mb-2">Réservations</h3>
          <ul className="space-y-2 text-sm max-h-80 overflow-auto">
            {(data?.bookings ?? []).map((b) => (
              <li key={b.id} className="border rounded-lg px-3 py-2">
                <p className="font-medium">{b.status}</p>
                <p className="text-xs text-gray-500">
                  {String(b.startDate).slice(0, 10)} → {String(b.endDate).slice(0, 10)}
                </p>
              </li>
            ))}
            {(data?.bookings ?? []).length === 0 && <li className="text-gray-500">Aucune sur la période.</li>}
          </ul>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h3 className="text-sm font-semibold mb-2">Blocages</h3>
          <ul className="space-y-2 text-sm max-h-80 overflow-auto">
            {(data?.blocks ?? []).map((b) => (
              <li key={b.id} className="border rounded-lg px-3 py-2 flex justify-between gap-2">
                <div>
                  <p className="font-medium">{b.reason || "Blocage"}</p>
                  <p className="text-xs text-gray-500">
                    {String(b.startDate).slice(0, 10)} → {String(b.endDate).slice(0, 10)}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={() => void deleteCalendarBlock(b.id).then(load)}
                >
                  Retirer
                </button>
              </li>
            ))}
            {(data?.blocks ?? []).length === 0 && <li className="text-gray-500">Aucun blocage.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
