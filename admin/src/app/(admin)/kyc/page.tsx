"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, type KycItem } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnDanger,
  BtnSuccess,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/ui";

export default function KycPage() {
  const { canWrite } = useAdmin();
  const [items, setItems] = useState<KycItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<KycItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<KycItem[]>("/api/admin/kyc/pending");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function review(id: string, approved: boolean) {
    try {
      await apiFetch(`/api/admin/kyc/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ approved }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la validation");
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="KYC" subtitle="Validation des documents chauffeurs" />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message="Aucun KYC en attente" />
      ) : (
        <div className="space-y-3">
          {items.map((k) => (
            <Card key={k.id} className="p-4 flex flex-wrap justify-between items-center gap-4">
              <div>
                <p className="font-medium">{k.type}</p>
                <p className="text-sm text-gray-500">Utilisateur {k.userId}</p>
                <StatusBadge status={k.status} />
                {k.url && (
                  <button type="button" onClick={() => setPreview(k)} className="block mt-2 text-sm text-[#6C63FF] hover:underline">
                    Aperçu document
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {canWrite("kyc") && (
                  <>
                    <BtnSuccess onClick={() => review(k.id, true)}>Approuver</BtnSuccess>
                    <BtnDanger onClick={() => review(k.id, false)}>Rejeter</BtnDanger>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {preview?.url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl p-4 max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium mb-3">{preview.type} — {preview.userId}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt="Document KYC" className="w-full rounded-lg border" />
            <button type="button" onClick={() => setPreview(null)} className="mt-4 text-sm text-gray-500 underline">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
