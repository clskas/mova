"use client";

import { useCallback, useEffect, useState } from "react";
import { usePartnerLiveRegister } from "@/components/PartnerLiveProvider";
import {
  createPromo,
  fetchPromos,
  formatCdf,
  updatePromo,
  type PartnerPromo,
} from "@/lib/api";

const emptyForm = () => ({
  code: "",
  discountPercent: 10,
  maxUses: 50,
  validUntil: "",
});

export default function PromosPage() {
  const [promos, setPromos] = useState<PartnerPromo[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchPromos();
      setPromos(data.promos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  usePartnerLiveRegister(load);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await createPromo({
        code: form.code,
        discountPercent: form.discountPercent,
        maxUses: form.maxUses,
        validUntil: form.validUntil || undefined,
      });
      setForm(emptyForm());
      setMessage("Code promo créé.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(promo: PartnerPromo) {
    try {
      await updatePromo(promo.id, { isActive: !promo.isActive });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  return (
    <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-[#1A1A2E]">Codes promo location</h2>
          <p className="text-sm text-gray-600 mt-1">
            Codes valables uniquement sur vos véhicules. La remise est toujours déduite de votre part — SENGA ne la finance pas.
          </p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {message && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{message}</p>}

        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-indigo-100 p-4 space-y-4">
          <h3 className="font-medium">Nouveau code</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="block text-sm">
              Code
              <input
                required
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="mt-1 w-full border rounded-lg px-3 py-2"
                placeholder="LOUEUR15"
              />
            </label>
            <label className="block text-sm">
              Réduction (%)
              <input
                type="number"
                min={1}
                max={100}
                value={form.discountPercent}
                onChange={(e) => setForm((f) => ({ ...f, discountPercent: Number(e.target.value) }))}
                className="mt-1 w-full border rounded-lg px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Quota
              <input
                type="number"
                min={1}
                value={form.maxUses}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: Number(e.target.value) }))}
                className="mt-1 w-full border rounded-lg px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Valide jusqu&apos;au
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2"
              />
            </label>
          </div>
          <p className="text-xs text-gray-500">
            La remise sera déduite de votre part nette après commission SENGA.
          </p>
          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Création…" : "Créer le code"}
          </button>
        </form>

        <section className="bg-white rounded-xl border border-indigo-100 overflow-hidden">
          <h3 className="font-medium px-4 py-3 border-b border-indigo-50">Vos codes</h3>
          {loading ? (
            <p className="p-4 text-sm text-gray-500">Chargement…</p>
          ) : promos.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Aucun code promo.</p>
          ) : (
            <ul className="divide-y divide-indigo-50">
              {promos.map((p) => (
                <li key={p.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono font-semibold">{p.code}</p>
                    <p className="text-sm text-gray-600">
                      {p.discountPercent != null ? `−${p.discountPercent} %` : p.discountCdf != null ? `−${formatCdf(p.discountCdf)}` : "—"}
                      {" · sous-total location · À votre charge"}
                      {p.maxUses != null && ` · ${p.usedCount ?? 0}/${p.maxUses}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleActive(p)}
                    className={`text-sm px-3 py-1 rounded-lg ${
                      p.isActive ? "bg-gray-100 text-gray-700" : "bg-green-100 text-green-800"
                    }`}
                  >
                    {p.isActive ? "Désactiver" : "Réactiver"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
    </div>
  );
}
