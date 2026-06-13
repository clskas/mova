"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, saveRestaurant, type Restaurant } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  TextInput,
} from "@/components/ui";

export default function RestaurantsPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("restaurants");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", cuisine: "Congolaise", address: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Restaurant[]>("/api/admin/restaurants");
      setRestaurants(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || readOnly) return;
    setSaving(true);
    setError(null);
    try {
      await saveRestaurant({
        name: form.name.trim(),
        cuisine: form.cuisine.trim(),
        address: form.address.trim() || "Kinshasa",
        lat: -4.32,
        lng: 15.31,
        rating: 4.0,
      });
      setForm({ name: "", cuisine: "Congolaise", address: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur création");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader title="Restaurants" subtitle="CRUD livraison repas" />
      {error && <ErrorBanner message={error} onRetry={load} />}

      {!readOnly && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <h2 className="font-semibold text-sm text-gray-700">Ajouter un restaurant</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Nom" />
            <TextInput value={form.cuisine} onChange={(v) => setForm((f) => ({ ...f, cuisine: v }))} placeholder="Cuisine" />
            <TextInput value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} placeholder="Adresse" />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-[#6C63FF] text-white text-sm font-medium disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Créer"}
          </button>
        </form>
      )}

      {loading ? (
        <LoadingState />
      ) : restaurants.length === 0 ? (
        <EmptyState message="Aucun restaurant" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Nom</th>
                <th className="p-3">Cuisine</th>
                <th className="p-3">Adresse</th>
                <th className="p-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {restaurants.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3">{r.cuisine ?? "—"}</td>
                  <td className="p-3 text-gray-500">{r.address ?? "—"}</td>
                  <td className="p-3">{r.rating?.toFixed(1) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
