"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRestaurantLiveRegister } from "@/components/RestaurantLiveProvider";
import { ChatPanel } from "@/components/ChatPanel";
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
import { PartnerAmountLine } from "@/components/PartnerAmountLine";

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

import {
  alertNewRestaurantOrder,
  notifyPartnerAlert,
  requestPartnerNotificationPermission,
} from "@/lib/partner-alerts";

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [chatPeerLabel, setChatPeerLabel] = useState("Client");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [filtersActive, setFiltersActive] = useState(false);
  const [paginationTotal, setPaginationTotal] = useState<number | null>(null);
  const seenPendingIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    const status = searchParams.get("status") ?? "";
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";
    if (status || from || to) {
      setFilterStatus(status);
      setFilterFrom(from);
      setFilterTo(to);
      setFiltersActive(true);
      setLoading(true);
    }
  }, [searchParams]);

  function openChat(orderId: string, peerLabel: string) {
    setChatOrderId(orderId);
    setChatPeerLabel(peerLabel);
  }

  function closeChat() {
    setChatOrderId(null);
    setChatPeerLabel("Client");
  }

  const notifyNewOrders = useCallback((newOrders: RestaurantOrder[]) => {
    if (newOrders.length === 0) return;
    const first = newOrders[0];
    const body =
      newOrders.length > 1
        ? `${newOrders.length} nouvelles commandes à confirmer`
        : `Commande #${first.id.slice(0, 8)} · Votre part ${formatCdf(first.partnerNetCdf ?? first.itemsSubtotalCdf)}`;
    if (newOrders.length === 1) {
      alertNewRestaurantOrder(first.id, body);
    } else {
      notifyPartnerAlert({
        key: `orders-batch:${first.id}`,
        title: "Nouvelles commandes MOVA",
        body,
        tag: "mova-new-order",
      });
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, o] = await Promise.all([
        fetchProfile(),
        fetchOrders(
          filtersActive
            ? {
                status: filterStatus || undefined,
                from: filterFrom || undefined,
                to: filterTo || undefined,
                q: filterQ.trim() || undefined,
                take: 50,
              }
            : undefined,
        ),
      ]);
      setProfile(p);
      const list = o.orders ?? [];
      setOrders(list);
      setPaginationTotal(o.pagination?.total ?? null);

      if (!filtersActive) {
        const pendingIds = list.filter((x) => x.status === "PENDING").map((x) => x.id);
        if (seenPendingIds.current === null) {
          seenPendingIds.current = new Set(pendingIds);
        } else {
          const fresh = list.filter(
            (x) => x.status === "PENDING" && !seenPendingIds.current!.has(x.id),
          );
          notifyNewOrders(fresh);
          seenPendingIds.current = new Set(pendingIds);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [notifyNewOrders, filtersActive, filterStatus, filterFrom, filterTo, filterQ]);

  useEffect(() => {
    requestPartnerNotificationPermission();
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
          <p className="text-sm text-gray-500">Gérez vos commandes en temps réel</p>
        </div>

        <section className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-700">Recherche avancée</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <select
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Tous statuts</option>
              <option value="PENDING">En attente</option>
              <option value="RESTAURANT_CONFIRMED">Confirmée</option>
              <option value="READY_FOR_PICKUP">Prête</option>
              <option value="DELIVERED">Livrée</option>
              <option value="CANCELLED">Annulée</option>
            </select>
            <input type="date" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
            <input type="date" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
            <input
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm lg:col-span-2"
              placeholder="N° commande, adresse…"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setFiltersActive(true); setLoading(true); }}
              className="px-4 py-2 rounded-xl bg-orange-600 text-white text-sm"
            >
              Filtrer
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterStatus("");
                setFilterFrom("");
                setFilterTo("");
                setFilterQ("");
                setFiltersActive(false);
                setLoading(true);
              }}
              className="px-4 py-2 rounded-xl border text-sm"
            >
              Réinitialiser
            </button>
            {filtersActive && paginationTotal != null && (
              <span className="text-xs text-gray-500 self-center">{paginationTotal} résultat(s)</span>
            )}
          </div>
        </section>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
        )}

        {chatOrderId && (
          <ChatPanel
            referenceId={chatOrderId}
            kind="delivery"
            peerLabel={chatPeerLabel}
            subtitle="Messages visibles par client, livreur et restaurant"
            onClose={closeChat}
          />
        )}

        {loading ? (
          <p className="text-gray-400 py-12 text-center">Chargement…</p>
        ) : filtersActive ? (
          <section>
            <h3 className="font-semibold text-gray-700 mb-3">Résultats filtrés ({orders.length})</h3>
            {orders.length === 0 ? (
              <p className="text-gray-400 text-sm bg-white rounded-xl p-6 border">Aucune commande ne correspond aux critères</p>
            ) : (
              <div className="space-y-3">
                {orders.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    busy={busyId === o.id}
                    onConfirm={o.status === "PENDING" ? () => act(o.id, "confirm") : undefined}
                    onReject={o.status === "PENDING" ? () => act(o.id, "reject") : undefined}
                    onReady={o.status === "RESTAURANT_CONFIRMED" ? () => act(o.id, "ready") : undefined}
                    onChatClient={() => openChat(o.id, "Client")}
                    onChatDriver={o.driverAssigned ? () => openChat(o.id, "Livreur") : undefined}
                  />
                ))}
              </div>
            )}
          </section>
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
                    <OrderCard
                      key={o.id}
                      order={o}
                      busy={busyId === o.id}
                      onConfirm={() => act(o.id, "confirm")}
                      onReject={() => act(o.id, "reject")}
                      onChatClient={() => openChat(o.id, "Client")}
                      onChatDriver={o.driverAssigned ? () => openChat(o.id, "Livreur") : undefined}
                    />
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
                      onChatClient={() => openChat(o.id, "Client")}
                      onChatDriver={o.driverAssigned ? () => openChat(o.id, "Livreur") : undefined}
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
  onChatClient,
  onChatDriver,
}: {
  order: RestaurantOrder;
  busy: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
  onReady?: () => void;
  onChatClient?: () => void;
  onChatDriver?: () => void;
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
        {order.paymentStatusLabel && (
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium ${
              order.isPaid ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"
            }`}
          >
            {order.paymentStatusLabel}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-800 mb-1">{formatItems(order.items)}</p>
      <p className="text-sm text-gray-500 mb-1">Livraison : {order.deliveryAddress ?? "—"}</p>
      <div className="mb-4">
        <PartnerAmountLine
          subtotalCdf={order.itemsSubtotalCdf}
          partnerNetCdf={order.partnerNetCdf}
          partnerDiscountCdf={order.partnerDiscountCdf}
          promoCode={order.promoCode}
        />
      </div>
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
        {onChatClient && !["DELIVERED", "CANCELLED"].includes(order.status) && (
          <button
            type="button"
            disabled={busy}
            onClick={onChatClient}
            className="px-4 py-2 rounded-xl border border-[#6C63FF]/30 text-[#6C63FF] text-sm disabled:opacity-60"
          >
            Chat client
          </button>
        )}
        {onChatDriver && !["DELIVERED", "CANCELLED"].includes(order.status) && (
          <button
            type="button"
            disabled={busy}
            onClick={onChatDriver}
            className="px-4 py-2 rounded-xl border border-emerald-300 text-emerald-700 text-sm disabled:opacity-60"
          >
            Chat livreur
          </button>
        )}
        {order.driverAssigned && (
          <span className="text-xs text-green-700 self-center">Livreur assigné</span>
        )}
      </div>
    </div>
  );
}
