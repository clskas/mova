"use client";

import { useEffect, useState } from "react";
import { fetchReceiptHistory, formatCdf, type ReceiptSummary } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";

type Props = {
  onBack: () => void;
  onOpenReceipt: (referenceType: string, referenceId: string) => void;
};

export function ReceiptsListView({ onBack, onOpenReceipt }: Props) {
  const [items, setItems] = useState<ReceiptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReceiptHistory(50)
      .then((res) => setItems(res.data ?? []))
      .catch((e) => setError(toUserErrorMessage(e, "Erreur")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-[#6C63FF]">← Retour</button>
      <h2 className="text-lg font-semibold">Mes reçus</h2>
      {loading && <p className="text-gray-500 py-8 text-center">Chargement…</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
      {!loading && items.length === 0 && (
        <p className="text-gray-500 py-8 text-center">Aucun reçu disponible.</p>
      )}
      <div className="space-y-3">
        {items.map((item) => (
          <button
            key={`${item.referenceType}-${item.referenceId}`}
            type="button"
            onClick={() => onOpenReceipt(item.referenceType, item.referenceId)}
            className="w-full text-left bg-white rounded-xl p-4 shadow-sm hover:border-[#6C63FF] border border-transparent"
          >
            <p className="font-medium truncate">{item.title}</p>
            <p className="text-xs font-mono text-gray-500">{item.receiptNumber}</p>
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-gray-400">
                {new Date(item.createdAt).toLocaleString("fr-CD")}
              </span>
              <span className="text-sm font-semibold text-green-700">{formatCdf(item.amountCdf)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
