"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, formatCdf } from "@/lib/api";
import {
  isWalletRecharge,
  isWalletWithdraw,
  walletTxLabel,
  type WalletTx,
} from "@/lib/wallet-movements";

type Filter = "all" | "recharge" | "withdraw";

const PAGE_SIZE = 100;

type Props = {
  mock?: boolean;
  title?: string;
  refreshKey?: number;
  accentClass?: string;
};

export function WalletMovementHistory({
  mock = false,
  title = "Historique recharges & retraits",
  refreshKey = 0,
  accentClass = "bg-[#6C63FF] text-white",
}: Props) {
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
        undefined,
        { useMock: mock },
      );
      setTransactions(page.data ?? []);
      setTotal(page.total ?? page.data?.length ?? 0);
    } catch {
      setTransactions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [mock]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const page = await apiFetch<{ data?: WalletTx[]; total?: number }>(
        `/api/wallet/transactions?limit=${PAGE_SIZE}&offset=${transactions.length}`,
        undefined,
        { useMock: mock },
      );
      const batch = page.data ?? [];
      setTransactions((prev) => [...prev, ...batch]);
      setTotal(page.total ?? transactions.length + batch.length);
    } finally {
      setLoadingMore(false);
    }
  }, [mock, transactions.length]);

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
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{title}</p>
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
              filter === id ? accentClass : "bg-white border border-gray-200 text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-200 p-4 text-center">
          Aucune recharge ou retrait pour ce filtre.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((tx, i) => {
            const amt = tx.amountCdf ?? 0;
            const credit = amt >= 0;
            const recharge = isWalletRecharge(tx);
            return (
              <div key={tx.id ?? i} className="bg-white rounded-xl p-3 shadow-sm flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{walletTxLabel(tx)}</p>
                  <p className="text-xs text-gray-500">
                    {tx.createdAt ? new Date(tx.createdAt).toLocaleString("fr-CD") : ""}
                  </p>
                </div>
                <p className={`font-bold shrink-0 ${credit ? "text-[#00D4A1]" : "text-[#1A1A2E]"}`}>
                  {credit ? "+" : ""}
                  {formatCdf(Math.abs(amt))}
                  {recharge ? " ↑" : isWalletWithdraw(tx) ? " ↓" : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {!loading && hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-[#6C63FF] disabled:opacity-50"
        >
          {loadingMore
            ? "Chargement…"
            : `Charger plus (${transactions.length} / ${total})`}
        </button>
      )}
    </section>
  );
}
