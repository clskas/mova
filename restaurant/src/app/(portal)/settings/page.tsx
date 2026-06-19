"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "@/components/PortalShell";
import { fetchProfile, updateMenuSettings, type RestaurantProfile } from "@/lib/api";

export default function SettingsPage() {
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [accepting, setAccepting] = useState(true);
  const [prepTime, setPrepTime] = useState(25);
  const [promo, setPromo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await fetchProfile();
      setProfile(p);
      setAccepting(p.isAcceptingOrders ?? true);
      setPrepTime(p.prepTimeMin ?? 25);
      setPromo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateMenuSettings({
        isAcceptingOrders: accepting,
        prepTimeMin: prepTime,
        promotionLabel: promo.trim() || undefined,
      });
      setMessage("Paramètres enregistrés");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalShell restaurantName={profile?.name}>
      <div className="max-w-lg space-y-6">
        <h2 className="text-xl font-bold">Paramètres</h2>
        {loading ? (
          <p className="text-gray-400">Chargement…</p>
        ) : (
          <div className="bg-white rounded-2xl border p-6 space-y-5">
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm">Accepter les commandes</span>
              <input type="checkbox" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} className="w-5 h-5" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Temps de préparation (minutes)</span>
              <input
                type="number"
                min={5}
                max={120}
                className="mt-1 w-full rounded-xl border p-3"
                value={prepTime}
                onChange={(e) => setPrepTime(Number(e.target.value))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Promotion (optionnel)</span>
              <input
                className="mt-1 w-full rounded-xl border p-3"
                placeholder="Ex. -10% aujourd'hui"
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="w-full py-3 rounded-xl bg-[#FF6B35] text-white font-medium disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            {message && <p className="text-sm text-green-700">{message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <p className="text-xs text-gray-400">
              Gérez les plats et photos dans l&apos;onglet <a href="/menu" className="text-orange-600 underline">Menu</a>.
            </p>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
