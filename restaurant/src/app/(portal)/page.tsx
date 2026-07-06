"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRestaurantLiveRegister } from "@/components/RestaurantLiveProvider";
import {
  confirmOrder,
  fetchOrders,
  fetchProfile,
  formatCdf,
  markOrderReady,
  rejectOrder,
  type RestaurantOrder,
  type RestaurantProfile,
} from "@/lib/api";

function formatItems(items: unknown): string {
  if (!Array.isArray(items)) return "—";
  return items
    .map((it) => {
      if (typeof it !== "object" || !it) return "";
      const row = it as Record<string, unknown>;
      const qty = row.quantity ?? row.qty ?? 1;
      const name = row.name ?? row.itemName ?? "Article";
      return `${qty}× ${name}`;
    })
    .filter(Boolean)
    .join(", ");
}

/** Bip sonore via Web Audio (aucun fichier requis). */
function playNewOrderChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [880, 1175];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.34);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* audio indisponible — silencieux */
  }
}

export default function OrdersPage() {
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const seenPendingIds = useRef<Set<string> | null>(null);

  const notifyNewOrders = useCallback((newOrders: RestaurantOrder[]) => {
    if (newOrders.length === 0) return;
    playNewOrderChime();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const first = newOrders[0];
      new Notification("Nouvelle commande MOVA", {
        body:
          newOrders.length > 1
            ? `${newOrders.length} nouvelles commandes à confirmer`
            : `Commande #${first.id.slice(0, 8)} · ${formatCdf(first.estimatedPriceCdf)}`,
        tag: "mova-new-order",
      });
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, o] = await Promise.all([fetchProfile(), fetchOrders()]);
      setProfile(p);
      const list = o.orders ?? [];
      setOrders(list);

      const pendingIds = list.filter((x) => x.status === "PENDING").map((x) => x.id);
      if (seenPendingIds.current === null) {
        // Premier chargement : on initialise sans alerter.
        seenPendingIds.current = new Set(pendingIds);
      } else {
        const fresh = list.filter(
          (x) => x.status === "PENDING" && !seenPendingIds.current!.has(x.id),
        );
        notifyNewOrders(fresh);
        seenPendingIds.current = new Set(pendingIds);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [notifyNewOrders]);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  useRestaurantLiveRegister(load);

  async function act(id: string, action: "confirm" | "ready" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      if (action === "confirm") await confirmOrder(id);
      else if (action === "ready") await markOrderReady(id);
      else await rejectOrder(id, "Indisponible");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusyId(null);
    }
  }

  const pending = orders.filter((o) => o.status === "PENDING");
  const active = orders.filter((o) => !["DELIVERED", "CANCELLED", "PENDING"].includes(o.status));

  return (
    <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold">Commandes en cours</h2>
          <p className="text-sm text-gray-500">Temps réel + actualisation de secours toutes les 30 s · alerte sonore à chaque nouvelle commande</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
        )}

        {loading ? (
          <p className="text-gray-400 py-12 text-center">Chargement…</p>
        ) : (
          <>
            <section>
              <h3 className="font-semibold text-orange-700 mb-3">
                Nouvelles ({pending.length})
              </h3>
              {pending.length === 0 ? (
                <p className="text-gray-400 text-sm bg-white rounded-xl p-6 border">Aucune nouvelle commande</p>
              ) : (
                <div className="space-y-3">
                  {pending.map((o) => (
                    <OrderCard key={o.id} order={o} busy={busyId === o.id} onConfirm={() => act(o.id, "confirm")} onReject={() => act(o.id, "reject")} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="font-semibold text-violet-700 mb-3">En cours ({active.length})</h3>
              {active.length === 0 ? (
                <p className="text-gray-400 text-sm bg-white rounded-xl p-6 border">Rien en cuisine pour le moment</p>
              ) : (
                <div className="space-y-3">
                  {active.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      busy={busyId === o.id}
                      onReady={o.status === "RESTAURANT_CONFIRMED" ? () => act(o.id, "ready") : undefined}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
    </div>
  );
}

function OrderCard({
  order,
  busy,
  onConfirm,
  onReject,
  onReady,
}: {
  order: RestaurantOrder;
  busy: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
  onReady?: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-[#1A1A2E]">#{order.id.slice(0, 8)}</p>
          <p className="text-xs text-gray-400">{order.createdAt ? new Date(order.createdAt).toLocaleString("fr-CD") : ""}</p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-800 font-medium">
          {order.statusLabel ?? order.status}
        </span>
      </div>
      <p className="text-sm text-gray-800 mb-1">{formatItems(order.items)}</p>
      <p className="text-sm text-gray-500 mb-1">Livraison : {order.deliveryAddress ?? "—"}</p>
      <p className="text-sm font-medium text-[#6C63FF] mb-4">{formatCdf(order.estimatedPriceCdf)}</p>
      <div className="flex flex-wrap gap-2">
        {onConfirm && (
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-60"
          >
            Accepter
          </button>
        )}
        {onReady && (
          <button
            type="button"
            disabled={busy}
            onClick={onReady}
            className="px-4 py-2 rounded-xl bg-[#6C63FF] text-white text-sm font-medium disabled:opacity-60"
          >
            Prête pour livreur
          </button>
        )}
        {onReject && (
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm disabled:opacity-60"
          >
            Refuser
          </button>
        )}
        {order.driverAssigned && (
          <span className="text-xs text-green-700 self-center">Livreur assigné</span>
        )}
      </div>
    </div>
  );
}
