"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";
import { isWalletRecharge, isWalletWithdraw, walletTxLabel, type WalletTx } from "@/lib/wallet-movements";

type Filter = "all" | "recharge" | "withdraw";

const PAGE_SIZE = 100;

type Props = {
  title?: string;
  refreshKey?: number;
};

export function WalletMovementHistory({ title = "Historique recharges & retraits", refreshKey = 0 }: Props) {
  const [transactions, setTransactions] = useState<WalletTx[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const page = await apiFetch<{ data?: WalletTx[]; total?: number }>(
        `/api/wallet/transactions?limit=${PAGE_SIZE}&offset=0`,
      );
      setTransactions(page.data ?? []);
      setTotal(page.total ?? page.data?.length ?? 0);
    } catch {
      setTransactions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const page = await apiFetch<{ data?: WalletTx[]; total?: number }>(
        `/api/wallet/transactions?limit=${PAGE_SIZE}&offset=${transactions.length}`,
      );
      const batch = page.data ?? [];
      setTransactions((prev) => [...prev, ...batch]);
      setTotal(page.total ?? transactions.length + batch.length);
    } finally {
      setLoadingMore(false);
    }
  }, [transactions.length]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial, refreshKey]);

  const recharges = useMemo(() => transactions.filter(isWalletRecharge), [transactions]);
  const withdraws = useMemo(() => transactions.filter(isWalletWithdraw), [transactions]);
  const hasMore = transactions.length < total;

  const visible = useMemo(() => {
    if (filter === "recharge") return recharges;
    if (filter === "withdraw") return withdraws;
    return transactions.filter((tx) => isWalletRecharge(tx) || isWalletWithdraw(tx));
  }, [filter, transactions, recharges, withdraws]);

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-[#1A1A2E]">{title}</h3>
        <button type="button" onClick={loadInitial} className="text-xs text-[#6C63FF]">
          Actualiser
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {([
          ["all", `Tout (${recharges.length + withdraws.length})`],
          ["recharge", `Recharges (${recharges.length})`],
          ["withdraw", `Retraits (${withdraws.length})`],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              filter === id ? "bg-orange-600 text-white" : "bg-gray-50 border border-gray-200 text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">Aucune recharge ou retrait enregistré.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {visible.map((tx, i) => {
            const amt = tx.amountCdf ?? 0;
            const credit = amt >= 0;
            return (
              <li key={tx.id ?? i} className="py-3 flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{walletTxLabel(tx)}</p>
                  <p className="text-xs text-gray-500">
                    {tx.createdAt ? new Date(tx.createdAt).toLocaleString("fr-CD") : ""}
                  </p>
                </div>
                <span className={`text-sm font-semibold shrink-0 ${credit ? "text-green-700" : "text-[#1A1A2E]"}`}>
                  {credit ? "+" : ""}
                  {formatCdf(Math.abs(amt))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full rounded-lg border border-gray-200 py-2 text-sm font-medium text-orange-600 disabled:opacity-50"
        >
          {loadingMore ? "Chargement…" : `Charger plus (${transactions.length} / ${total})`}
        </button>
      )}
    </section>
  );
}
