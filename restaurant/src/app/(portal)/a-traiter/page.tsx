"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchPartnerInbox } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";

export default function ATraiterPage() {
  const [items, setItems] = useState<Array<{ id: string; kind: string; title: string; href: string; meta?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchPartnerInbox();
      setItems(res.items ?? []);
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de charger l’inbox"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-[#1A1A2E]">À traiter</h2>
        <p className="text-sm text-slate-500 mt-1">KYC, commandes, stock et avis en attente.</p>
      </div>
      {loading && <p className="text-sm text-slate-500">Chargement…</p>}
      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-slate-600 rounded-xl border bg-white px-4 py-6 text-center">Rien à traiter pour le moment.</p>
      )}
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={it.href}
              className="block rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-[var(--brand)]/40 transition"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{it.kind}</span>
              <p className="font-medium text-[#1A1A2E] mt-0.5">{it.title}</p>
              {it.meta && <p className="text-xs text-slate-500 mt-1">{it.meta}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
