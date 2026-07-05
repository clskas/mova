"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchEarnings, formatCdf, downloadOrderReceiptPdf, type RestaurantEarnings } from "@/lib/api";

export default function EarningsPage() {
  const [earnings, setEarnings] = useState<RestaurantEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const e = await fetchEarnings();
      setEarnings(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-[#1A1A2E]">Revenus repas</h2>
          <p className="text-sm text-gray-600 mt-1">
            Votre part des ventes est créditée après paiement du client (commission MOVA déduite).
          </p>
        </div>

        {loading && <p className="text-gray-500">Chargement…</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {earnings && (
          <>
            <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 shadow-md">
              <p className="text-sm opacity-90">Solde disponible</p>
              <p className="text-3xl font-bold mt-1">{earnings.formattedBalance}</p>
              <p className="text-xs opacity-80 mt-2">
                Les frais de livraison et la commission plateforme sont versés au livreur et à MOVA.
              </p>
            </div>

            <section>
              <h3 className="font-medium text-[#1A1A2E] mb-3">Dernières ventes créditées</h3>
              {earnings.recentFoodSales.length === 0 ? (
                <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-200 p-6 text-center">
                  Aucune vente créditée pour le moment. Les paiements apparaissent ici une fois la commande livrée et payée.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white overflow-hidden">
                  {earnings.recentFoodSales.map((sale) => (
                    <li key={sale.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-[#1A1A2E]">{sale.description ?? "Vente repas"}</p>
                        <p className="text-xs text-gray-500">
                          {sale.createdAt ? new Date(sale.createdAt).toLocaleString("fr-CD") : "—"}
                        </p>
                        {sale.reference && (
                          <button
                            type="button"
                            onClick={() => downloadOrderReceiptPdf(sale.reference!).catch((e) => alert(e.message))}
                            className="text-xs text-[#6C63FF] underline mt-1"
                          >
                            Télécharger reçu partenaire
                          </button>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-green-700">+{formatCdf(sale.amountCdf)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
    </div>
  );
}
