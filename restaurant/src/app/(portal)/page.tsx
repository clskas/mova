"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRestaurantLiveRegister } from "@/components/RestaurantLiveProvider";
import { ChatPanel } from "@/components/ChatPanel";
import {
  assignOwnDriver,
  confirmOrder,
  fetchOrders,
  fetchRestaurantDrivers,
  formatCdf,
  isInternalFleetMode,
  markOrderReady,
  rejectOrder,
  type RestaurantFleetDriver,
  type RestaurantOrder,
} from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";
import { PartnerAmountLine } from "@/components/PartnerAmountLine";
import { useCommerceCopy } from "@/components/CommerceTypeContext";

function normalizeOptionLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (!entry || typeof entry !== "object") return "";
      const row = entry as Record<string, unknown>;
      const label = String(row.label ?? row.name ?? row.option ?? "").trim();
      const group = String(row.group ?? row.groupName ?? "").trim();
      if (!label) return "";
      return group ? `${group}: ${label}` : label;
    })
    .filter(Boolean);
}

/** Lignes articles avec taille + options/compléments pour resto et autres commerces. */
function formatOrderItemLines(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const lines: string[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const row = it as Record<string, unknown>;
    // Bloc multi-commerce : { restaurantId, items: [...] }
    if (Array.isArray(row.items) && (row.restaurantId != null || row.partnerId != null)) {
      lines.push(...formatOrderItemLines(row.items));
      continue;
    }
    const qty = Number(row.quantity ?? row.qty ?? 1) || 1;
    const name = String(row.name ?? row.itemName ?? row.title ?? "Article").trim() || "Article";
    const size = String(
      row.size ?? row.sizeLabel ?? row.selectedSize ?? row.taille ?? "",
    ).trim();
    const opts = normalizeOptionLabels(
      row.options ?? row.selectedOptions ?? row.complements ?? row.extras,
    );
    const extras = [size ? `Taille: ${size}` : "", ...opts].filter(Boolean);
    lines.push(extras.length ? `${qty}× ${name} — ${extras.join(" · ")}` : `${qty}× ${name}`);
  }
  return lines;
}

function formatItems(items: unknown): string {
  const lines = formatOrderItemLines(items);
  return lines.length ? lines.join(", ") : "—";
}

/** COD / espèces : préparer sans attendre le paiement (encaissement à la remise). */
function orderIsCashCod(order: RestaurantOrder): boolean {
  if (order.guaranteed === false) return true;
  const method = String(order.paymentMethod ?? "").toUpperCase();
  return method === "CASH" || method === "COD" || method === "ESPECES" || method === "ESPÈCES";
}

function orderCanPrepare(order: RestaurantOrder): boolean {
  if (order.canPrepare === true) return true;
  if (orderIsCashCod(order)) return true;
  return order.isPaid === true || order.escrowReady === true;
}

import {
  alertNewRestaurantOrder,
  notifyPartnerAlert,
} from "@/lib/partner-alerts";

export default function OrdersPage() {
  const copy = useCommerceCopy();
  const searchParams = useSearchParams();
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
  const [fleetDrivers, setFleetDrivers] = useState<RestaurantFleetDriver[]>([]);
  const [allowInternalCouriers, setAllowInternalCouriers] = useState(false);
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
        : `Commande #${first.id.slice(0, 8)} · ${formatItems(first.items)} · Votre part ${formatCdf(first.partnerNetCdf ?? first.itemsSubtotalCdf)}`;
    if (newOrders.length === 1) {
      alertNewRestaurantOrder(first.id, body);
    } else {
      notifyPartnerAlert({
        key: `orders-batch:${first.id}`,
        title: "Nouvelles commandes SENGA",
        body,
        tag: "mova-new-order",
      });
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [o, fleet] = await Promise.all([
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
        fetchRestaurantDrivers().catch(() => null),
      ]);
      const list = o.orders ?? [];
      setOrders(list);
      setPaginationTotal(o.pagination?.total ?? null);
      if (fleet) {
        const allow = isInternalFleetMode(fleet.courierMode, fleet.allowInternalCouriers);
        setAllowInternalCouriers(allow);
        setFleetDrivers(allow ? fleet.drivers ?? [] : []);
      }

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
      setError(toUserErrorMessage(e, "Erreur de chargement"));
    } finally {
      setLoading(false);
    }
  }, [notifyNewOrders, filtersActive, filterStatus, filterFrom, filterTo, filterQ]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  useRestaurantLiveRegister(load);

  async function act(
    id: string,
    action: "confirm" | "ready" | "reject",
    opts?: { notifyAllDrivers?: boolean },
  ) {
    setBusyId(id);
    setError(null);
    try {
      if (action === "confirm") await confirmOrder(id);
      else if (action === "ready") await markOrderReady(id, { notifyAllDrivers: opts?.notifyAllDrivers });
      else await rejectOrder(id, "Indisponible");
      await load();
    } catch (e) {
      setError(toUserErrorMessage(e, "Action impossible"));
    } finally {
      setBusyId(null);
    }
  }

  async function assignDriver(orderId: string, driverUserId: string) {
    setBusyId(orderId);
    setError(null);
    try {
      await assignOwnDriver(orderId, driverUserId);
      await load();
    } catch (e) {
      setError(toUserErrorMessage(e, "Assignation livreur impossible"));
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
            subtitle={copy.chatSubtitle}
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
                    fleetDrivers={allowInternalCouriers ? fleetDrivers : []}
                    onConfirm={o.status === "PENDING" ? () => act(o.id, "confirm") : undefined}
                    onReject={
                      o.status === "PENDING" || (o.status === "RESTAURANT_CONFIRMED" && !orderCanPrepare(o))
                        ? () => act(o.id, "reject")
                        : undefined
                    }
                    showNotifyAllDrivers={allowInternalCouriers}
                    onReady={
                      o.status === "RESTAURANT_CONFIRMED" && orderCanPrepare(o)
                        ? (opts) => act(o.id, "ready", opts)
                        : undefined
                    }
                    onAssignDriver={
                      allowInternalCouriers && !o.driverAssigned && o.status === "READY_FOR_PICKUP"
                        ? (driverUserId) => assignDriver(o.id, driverUserId)
                        : undefined
                    }
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
                      fleetDrivers={allowInternalCouriers ? fleetDrivers : []}
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
                <p className="text-gray-400 text-sm bg-white rounded-xl p-6 border">{copy.emptyOrders}</p>
              ) : (
                <div className="space-y-3">
                  {active.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      busy={busyId === o.id}
                      fleetDrivers={allowInternalCouriers ? fleetDrivers : []}
                      showNotifyAllDrivers={allowInternalCouriers}
                      onReady={
                        o.status === "RESTAURANT_CONFIRMED" && orderCanPrepare(o)
                          ? (opts) => act(o.id, "ready", opts)
                          : undefined
                      }
                      onReject={
                        o.status === "RESTAURANT_CONFIRMED" && !orderCanPrepare(o)
                          ? () => act(o.id, "reject")
                          : undefined
                      }
                      onAssignDriver={
                        allowInternalCouriers && !o.driverAssigned && o.status === "READY_FOR_PICKUP"
                          ? (driverUserId) => assignDriver(o.id, driverUserId)
                          : undefined
                      }
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
  fleetDrivers = [],
  showNotifyAllDrivers = false,
  onConfirm,
  onReject,
  onReady,
  onAssignDriver,
  onChatClient,
  onChatDriver,
}: {
  order: RestaurantOrder;
  busy: boolean;
  fleetDrivers?: RestaurantFleetDriver[];
  showNotifyAllDrivers?: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
  onReady?: (opts?: { notifyAllDrivers?: boolean }) => void;
  onAssignDriver?: (driverUserId: string) => void;
  onChatClient?: () => void;
  onChatDriver?: () => void;
}) {
  const [notifyAllDrivers, setNotifyAllDrivers] = useState(false);

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
              order.isPaid || (orderIsCashCod(order) && order.status !== "DELIVERED")
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {order.paymentStatusLabel}
          </span>
        )}
      </div>
      <div className="mb-1">
        {(() => {
          const lines = formatOrderItemLines(order.items);
          if (lines.length === 0) {
            return <p className="text-sm text-gray-800">—</p>;
          }
          return (
            <ul className="text-sm text-gray-800 space-y-1.5 list-none pl-0">
              {lines.map((line, i) => (
                <li key={`${order.id}-item-${i}`} className="leading-snug">
                  {line}
                </li>
              ))}
            </ul>
          );
        })()}
      </div>
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
            className="px-4 py-2.5 min-h-11 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-60"
          >
            Accepter
          </button>
        )}
        {onReady && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onReady({ notifyAllDrivers: showNotifyAllDrivers && notifyAllDrivers })}
            className="px-4 py-2.5 min-h-11 rounded-xl bg-[#6C63FF] text-white text-sm font-medium disabled:opacity-60"
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
      {onReady && showNotifyAllDrivers && (
        <label className="mt-3 flex items-start gap-2 text-xs text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-gray-300"
            checked={notifyAllDrivers}
            disabled={busy}
            onChange={(e) => setNotifyAllDrivers(e.target.checked)}
          />
          <span>
            Notifier <strong>tous</strong> les livreurs internes.
            <span className="block text-gray-500 font-normal">
              Décoché : aucun push à la flotte — seul le livreur que vous assignerez ensuite sera notifié.
            </span>
          </span>
        </label>
      )}
      {onAssignDriver && fleetDrivers.length > 0 && (
        <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-2">
          <p className="text-xs font-medium text-violet-900">Choisir un livreur interne</p>
          <p className="text-[11px] text-violet-800/80">
            Seul le livreur choisi reçoit l&apos;assignation (notification dédiée).
          </p>
          <div className="flex flex-wrap gap-2">
            {fleetDrivers
              .filter((d) => d.isActive)
              .map((d) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onAssignDriver(d.driverUserId)}
                  className="px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium disabled:opacity-60"
                >
                  {d.phone || d.name || "Livreur"}
                </button>
              ))}
          </div>
        </div>
      )}
      {onAssignDriver && fleetDrivers.length === 0 && (
        <p className="mt-3 text-xs text-amber-700">
          Ajoutez des livreurs internes dans Paramètres pour les assigner ici.
        </p>
      )}
      {order.status === "PENDING" && (
        <p className="mt-3 text-xs text-amber-700">
          {orderIsCashCod(order)
            ? "Nouvelle commande (espèces à la livraison). Acceptez pour commencer la préparation — le client paiera à la remise."
            : "Nouvelle commande non payée. Acceptez pour confirmer la disponibilité — le client paiera ensuite. Ne préparez pas avant le paiement."}
        </p>
      )}
      {order.status === "RESTAURANT_CONFIRMED" && !orderCanPrepare(order) && (
        <p className="mt-3 text-xs text-amber-700">
          Commande acceptée. En attente du paiement client (délai 15 min). Ne préparez pas et ne marquez pas
          « Prête » avant confirmation du paiement.
        </p>
      )}
      {order.status === "RESTAURANT_CONFIRMED" && orderCanPrepare(order) && (
        <p className="mt-3 text-xs text-green-700">
          {orderIsCashCod(order)
            ? "Paiement en espèces à la livraison. Vous pouvez préparer la commande puis la marquer prête pour le livreur."
            : "Paiement reçu. Vous pouvez préparer la commande puis la marquer prête pour le livreur."}
        </p>
      )}
    </div>
  );
}
