"use client";

import { useEffect, useState } from "react";
import { apiFetch, formatCdf, historyItemHasReceipt, historyToBillingType } from "@/lib/api";

type Ride = { id: string; pickupAddress?: string; dropoffAddress?: string; priceCdf?: number; status?: string };
type Delivery = {
  id: string;
  type?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  restaurantName?: string;
  deliveryAddress?: string;
  priceCdf?: number;
  status?: string;
};
type Scheduled = {
  id: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  scheduledAt?: string;
  priceCdf?: number;
  status?: string;
};

type Props = {
  onBack: () => void;
  onOpenReceipts: () => void;
  onOpenReceipt: (referenceType: string, referenceId: string) => void;
  mock?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Terminé",
  DELIVERED: "Livré",
  CONFIRMED: "Confirmé",
  IN_TRANSIT: "En transit",
  CANCELLED: "Annulé",
};

export function HistoryView({ onBack, onOpenReceipts, onOpenReceipt, mock = false }: Props) {
  const [tab, setTab] = useState<"rides" | "deliveries" | "scheduled">("rides");
  const [rides, setRides] = useState<Ride[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    function loadCache() {
      try {
        const raw = localStorage.getItem("mova_history");
        if (!raw) return false;
        const parsed = JSON.parse(raw) as {
          rides?: Ride[];
          deliveries?: Delivery[];
          scheduled?: Scheduled[];
          syncedAt?: string;
        };
        if (parsed.rides) setRides(parsed.rides);
        if (parsed.deliveries) setDeliveries(parsed.deliveries);
        if (parsed.scheduled) setScheduled(parsed.scheduled);
        if (parsed.syncedAt) setLastSync(parsed.syncedAt);
        setFromCache(true);
        setLoading(false);
        return true;
      } catch {
        return false;
      }
    }

    loadCache();

    async function load() {
      try {
        const [ridesData, deliveriesData, scheduledData] = await Promise.all([
          apiFetch<Ride[] | { data?: Ride[] }>("/api/rides/history?role=passenger", undefined, { useMock: mock }),
          apiFetch<{ data?: Delivery[] }>("/api/deliveries/history", undefined, { useMock: mock }),
          apiFetch<{ data?: Scheduled[] }>("/api/rides/scheduled", undefined, { useMock: mock }),
        ]);

        const rideList = Array.isArray(ridesData) ? ridesData : ridesData.data ?? [];
        setRides(rideList);
        setDeliveries(deliveriesData.data ?? []);
        setScheduled(scheduledData.data ?? []);
        setFromCache(false);
        const syncedAt = new Date().toISOString();
        setLastSync(syncedAt);

        try {
          localStorage.setItem(
            "mova_history",
            JSON.stringify({
              rides: rideList,
              deliveries: deliveriesData.data ?? [],
              scheduled: scheduledData.data ?? [],
              syncedAt,
            }),
          );
        } catch { /* ignore */ }
      } catch {
        if (!loadCache()) setLoading(false);
        return;
      }

      setLoading(false);
    }
    load();
  }, [mock]);

  const tabs = [
    { id: "rides" as const, label: "Courses" },
    { id: "deliveries" as const, label: "Livraisons" },
    { id: "scheduled" as const, label: "Planifiées" },
  ];

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Historique</h2>
        <button
          type="button"
          onClick={onOpenReceipts}
          className="text-xs px-3 py-1.5 rounded-lg border border-[#6C63FF] text-[#6C63FF]"
        >
          Mes reçus
        </button>
      </div>
      {fromCache && (
        <p className="text-xs text-[#FF6B35] bg-orange-50 rounded-lg py-2 px-3">
          Serveur indisponible — données en cache
          {lastSync ? ` · Dernière synchro : ${new Date(lastSync).toLocaleString("fr-CD")}` : ""}
        </p>
      )}

      <nav className="flex border-b bg-white rounded-t-xl overflow-hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs font-medium ${
              tab === t.id ? "text-[#6C63FF] border-b-2 border-[#6C63FF]" : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <p className="text-center text-gray-500 py-8">Chargement…</p>
      ) : (
        <div className="space-y-3">
          {tab === "rides" && (rides.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Aucune course</p>
          ) : rides.map((r) => (
            <div key={r.id} className="bg-white rounded-xl p-4 shadow-sm space-y-2">
              <p className="font-medium truncate">{r.pickupAddress} → {r.dropoffAddress}</p>
              <p className="text-[#6C63FF]">{formatCdf(r.priceCdf ?? 0)}</p>
              <p className="text-xs text-gray-400">{STATUS_LABELS[r.status ?? ""] ?? r.status}</p>
              {historyItemHasReceipt(r.status, "RIDE", (r as { isPaid?: boolean }).isPaid) && (
                <button
                  type="button"
                  onClick={() => onOpenReceipt("RIDE", r.id)}
                  className="text-xs text-[#6C63FF] underline"
                >
                  Voir le reçu
                </button>
              )}
            </div>
          )))}

          {tab === "deliveries" && (deliveries.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Aucune livraison</p>
          ) : deliveries.map((d) => (
            <div key={d.id} className="bg-white rounded-xl p-4 shadow-sm space-y-2">
              <p className="font-medium truncate">
                {d.type === "FOOD"
                  ? `🍽️ ${d.restaurantName} → ${d.deliveryAddress}`
                  : `📦 ${d.pickupAddress} → ${d.dropoffAddress}`}
              </p>
              <p className="text-[#00D4A1]">{formatCdf(d.priceCdf ?? 0)}</p>
              <p className="text-xs text-gray-400">{STATUS_LABELS[d.status ?? ""] ?? d.status}</p>
              {historyItemHasReceipt(d.status, d.type ?? "PARCEL") && (
                <button
                  type="button"
                  onClick={() => onOpenReceipt(historyToBillingType(d.type), d.id)}
                  className="text-xs text-[#6C63FF] underline"
                >
                  Voir le reçu
                </button>
              )}
            </div>
          )))}

          {tab === "scheduled" && (scheduled.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Aucune réservation planifiée</p>
          ) : scheduled.map((s) => (
            <div key={s.id} className="bg-white rounded-xl p-4 shadow-sm space-y-2">
              <p className="font-medium truncate">{s.pickupAddress} → {s.dropoffAddress}</p>
              <p className="text-sm text-gray-500">
                {s.scheduledAt ? new Date(s.scheduledAt).toLocaleString("fr-CD") : ""}
              </p>
              <p className="text-[#6C63FF]">{formatCdf(s.priceCdf ?? 0)}</p>
              <p className="text-xs text-gray-400">{STATUS_LABELS[s.status ?? ""] ?? s.status}</p>
              {historyItemHasReceipt(s.status, "SCHEDULED") && (
                <button
                  type="button"
                  onClick={() => onOpenReceipt("SCHEDULED", s.id)}
                  className="text-xs text-[#6C63FF] underline"
                >
                  Voir le reçu
                </button>
              )}
            </div>
          )))}
        </div>
      )}
    </div>
  );
}
