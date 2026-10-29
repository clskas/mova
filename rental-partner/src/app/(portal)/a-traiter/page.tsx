"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchPartnerInbox } from "@/lib/api";

export default function ATraiterPage() {
  const [items, setItems] = useState<Array<{ id: string; kind: string; title: string; href: string; meta?: string }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetchPartnerInbox();
      setItems(res.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold text-[#1A1A2E]">À traiter</h2>
      {loading && <p className="text-sm text-gray-500">Chargement…</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-gray-600 rounded-xl border bg-white px-4 py-6 text-center">Rien à traiter.</p>
      )}
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={it.href} className="block rounded-xl border bg-white px-4 py-3 hover:border-indigo-300">
              <span className="text-[10px] font-semibold uppercase text-gray-400">{it.kind}</span>
              <p className="font-medium mt-0.5">{it.title}</p>
              {it.meta && <p className="text-xs text-gray-500 mt-1">{it.meta}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
