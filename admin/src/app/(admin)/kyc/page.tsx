"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, fetchDrivers, reviewDriverKyc, type AdminDriver, type KycItem } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function resolveDocumentUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

export default function KycPage() {
  const { canWrite } = useAdmin();
  const [items, setItems] = useState<KycItem[]>([]);
  const [pendingDrivers, setPendingDrivers] = useState<AdminDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<KycItem | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, drivers] = await Promise.all([
        apiFetch<KycItem[]>("/api/admin/kyc/pending"),
        fetchDrivers(),
      ]);
      setItems(Array.isArray(data) ? data : []);
      setPendingDrivers(
        drivers.filter(
          (d) =>
            d.kycStatus === "PENDING" ||
            d.kycStatus === "REJECTED" ||
            (d.readyForReview && d.kycStatus === "PENDING"),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!loading) load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load, loading]);

  useEffect(() => {
    if (!preview?.url) {
      setPreviewBlobUrl(null);
      return;
    }
    const full = resolveDocumentUrl(preview.url);
    if (!full) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(full, { headers: authHeaders() })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("HTTP " + res.status))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewBlobUrl(full);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [preview]);

  async function review(id: string, approved: boolean) {
    try {
      const result = await apiFetch<{ activationPin?: string }>(`/api/admin/kyc/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ approved }),
      });
      if (approved && result.activationPin) {
        window.alert(`KYC approuvé.\n\nCode PIN d'activation chauffeur : ${result.activationPin}\n\nCommuniquez ce code au chauffeur pour qu'il puisse passer en ligne.`);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la validation");
    }
  }

  async function reviewDriver(userId: string, approved: boolean) {
    try {
      const result = await reviewDriverKyc(userId, approved);
      if (approved && result.activationPin) {
        window.alert(`KYC approuvé.\n\nCode PIN d'activation : ${result.activationPin}`);
      }
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
      ) : items.length === 0 && pendingDrivers.length === 0 ? (
        <EmptyState message="Aucun KYC en attente" />
      ) : (
        <div className="space-y-6">
          {items.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Documents en attente</h2>
              {items.map((k) => (
                <Card key={k.id} className="p-4 flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <p className="font-medium">{k.type}</p>
                    <p className="text-sm text-gray-500">Utilisateur {k.userId?.slice(0, 8)}…</p>
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
          {pendingDrivers.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">
                Chauffeurs sans validation complète
                {items.length === 0 && (
                  <span className="block font-normal text-gray-500 mt-1">
                    Aucun document en attente — validez le profil chauffeur directement.
                  </span>
                )}
              </h2>
              {pendingDrivers.map((d) => (
                <Card key={d.id} className="p-4 flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <p className="font-medium font-mono text-sm">{d.publicId ?? `${d.userId.slice(0, 8)}…`}</p>
                    <StatusBadge status={d.kycStatus} />
                    {!d.onboardingCompleted && (
                      <p className="text-xs text-amber-600 mt-1">Enregistrement en cours</p>
                    )}
                    {d.onboardingCompleted && d.kycStatus === "PENDING" && (
                      <p className="text-xs text-green-700 mt-1 font-medium">Dossier complet — prêt à valider</p>
                    )}
                  </div>
                  {canWrite("kyc") && (
                    <div className="flex gap-2">
                      <BtnSuccess onClick={() => reviewDriver(d.userId, true)}>Approuver</BtnSuccess>
                      {d.kycStatus !== "REJECTED" && (
                        <BtnDanger onClick={() => reviewDriver(d.userId, false)}>Rejeter</BtnDanger>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {preview?.url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl p-4 max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium mb-3">{preview.type} — {preview.userId}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewBlobUrl ?? resolveDocumentUrl(preview.url) ?? preview.url} alt="Document KYC" className="w-full rounded-lg border" />
            <button type="button" onClick={() => setPreview(null)} className="mt-4 text-sm text-gray-500 underline">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
