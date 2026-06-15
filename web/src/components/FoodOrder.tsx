"use client";

import { useEffect, useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";

type MenuItem = { id: string; name: string; priceCdf: number };
type ApiMenuItem = { id?: string; name: string; priceCdf?: number; unitPriceCdf?: number };
type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  deliveryMinCdf?: number;
  items: MenuItem[];
};

function normalizeRestaurant(raw: Record<string, unknown>): Restaurant {
  const menuRaw = (raw.menuItems as ApiMenuItem[] | undefined) ?? (raw.items as ApiMenuItem[] | undefined) ?? [];
  const items = menuRaw.map((item, index) => ({
    id: item.id ?? item.name ?? `item-${index}`,
    name: item.name,
    priceCdf: item.priceCdf ?? item.unitPriceCdf ?? 0,
  }));
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    cuisine: String(raw.cuisine ?? ""),
    rating: Number(raw.rating ?? 4.5),
    deliveryMinCdf: Number(raw.deliveryMinCdf ?? 3500),
    items,
  };
}

type Props = { onBack: () => void; mock: boolean };

export function FoodOrder({ onBack, mock }: Props) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [address, setAddress] = useState("Ma position");
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    apiFetch<{ data?: Record<string, unknown>[] }>("/api/deliveries/restaurants").then((res) => {
      setRestaurants((res.data ?? []).map(normalizeRestaurant));
      setLoading(false);
    });
  }, []);

  const cartTotal = selected
    ? Object.entries(cart).reduce((sum, [id, qty]) => {
        const item = selected.items.find((i) => i.id === id);
        return sum + (item?.priceCdf ?? 0) * qty;
      }, 0)
    : 0;

  const deliveryFee = selected?.deliveryMinCdf ?? 3500;

  function adjustCart(itemId: string, delta: number) {
    setCart((prev) => {
      const next = { ...prev };
      const qty = (next[itemId] ?? 0) + delta;
      if (qty <= 0) delete next[itemId];
      else next[itemId] = qty;
      return next;
    });
  }

  async function handleOrder() {
    if (!selected || cartTotal === 0) return;
    setOrdering(true);
    const items = Object.entries(cart).map(([id, quantity]) => {
      const item = selected.items.find((i) => i.id === id)!;
      return { name: item.name, unitPriceCdf: item.priceCdf, quantity };
    });
    const res = await apiFetch<{ delivery?: { estimatedPriceCdf?: number }; order?: { priceCdf?: number } }>("/api/deliveries/food", {
      method: "POST",
      body: JSON.stringify({
        restaurantId: selected.id,
        deliveryAddress: address,
        deliveryLat: -4.3217,
        deliveryLng: 15.3125,
        items,
      }),
    });
    setTotal(res.delivery?.estimatedPriceCdf ?? res.order?.priceCdf ?? cartTotal + deliveryFee);
    setConfirmed(true);
    setOrdering(false);
  }

  if (confirmed) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-4xl mb-2">🍽️</p>
          <p className="font-semibold">Commande envoyée</p>
          <p className="text-sm text-gray-500 mt-2">Total : {formatCdf(total)}</p>
          {mock && <p className="text-xs text-[#FF6B35] mt-2">Mode démo</p>}
        </div>
      </div>
    );
  }

  if (loading) {
    return <p className="text-center text-gray-500 py-8">Chargement des restaurants…</p>;
  }

  if (!selected) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-sm text-[#6C63FF]">← Accueil</button>
        <h2 className="text-lg font-semibold">Livraison repas</h2>
        {restaurants.map((r) => (
          <button
            key={r.id}
            onClick={() => { setSelected(r); setCart({}); }}
            className="w-full bg-white rounded-xl p-4 shadow-sm text-left flex items-center gap-3"
          >
            <span className="text-2xl">🍴</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{r.name}</p>
              <p className="text-xs text-gray-500">{r.cuisine} · ⭐ {r.rating}</p>
              <p className="text-xs text-[#6C63FF]">Livraison dès {formatCdf(r.deliveryMinCdf)}</p>
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={() => setSelected(null)} className="text-sm text-[#6C63FF]">← Restaurants</button>
      <h2 className="text-lg font-semibold">{selected.name}</h2>

      {selected.items.map((item) => {
        const qty = cart[item.id] ?? 0;
        return (
          <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.name}</p>
              <p className="text-sm text-[#6C63FF]">{formatCdf(item.priceCdf)}</p>
            </div>
            <button onClick={() => adjustCart(item.id, -1)} className="px-2 text-lg" disabled={qty === 0}>−</button>
            <span className="font-bold w-6 text-center">{qty}</span>
            <button onClick={() => adjustCart(item.id, 1)} className="px-2 text-lg">+</button>
          </div>
        );
      })}

      {cartTotal > 0 && (
        <>
          <input
            className="w-full rounded-xl border-0 bg-white p-3 shadow-sm"
            placeholder="Adresse de livraison"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-1 text-sm">
            <div className="flex justify-between"><span>Sous-total</span><span>{formatCdf(cartTotal)}</span></div>
            <div className="flex justify-between"><span>Livraison</span><span>{formatCdf(deliveryFee)}</span></div>
            <div className="flex justify-between font-bold pt-2 border-t">
              <span>Total</span>
              <span className="text-[#00D4A1]">{formatCdf(cartTotal + deliveryFee)}</span>
            </div>
          </div>
          <button
            onClick={handleOrder}
            disabled={ordering}
            className="w-full bg-[#00D4A1] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
          >
            {ordering ? "Commande…" : "Commander"}
          </button>
        </>
      )}
    </div>
  );
}
