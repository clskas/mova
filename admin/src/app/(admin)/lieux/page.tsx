"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approvePoiSuggestion,
  fetchPoiSuggestions,
  rejectPoiSuggestion,
  type PoiSuggestion,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnPrimary,
  Card,
  EmptyState,
  ErrorBanner,
  FieldLabel,
  LoadingState,
  Modal,
  PageHeader,
  TextInput,
} from "@/components/ui";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  APPROVED: "Publié",
  REJECTED: "Refusé",
};

const CATEGORY_LABELS: Record<string, string> = {
  MARKET: "Marché",
  HOSPITAL: "Hôpital",
  UNIVERSITY: "Université",
  PHARMACY: "Pharmacie",
  SCHOOL: "École",
  GOVERNMENT: "Administration",
  TRANSPORT: "Transport",
  OTHER: "Autre",
};

export default function LieuxPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("parametres");
  const [status, setStatus] = useState("PENDING");
  const [items, setItems] = useState<PoiSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [osmLink, setOsmLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPoiSuggestions(status);
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleApprove(id: string) {
    setActing(id);
    setError(null);
    try {
      const result = await approvePoiSuggestion(id);
      const url = result?.osm?.editUrl as string | undefined;
      if (url) setOsmLink(url);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec publication");
    } finally {
      setActing(null);
    }
  }

  async function handleReject() {
    if (!rejectId) return;
    setActing(rejectId);
    setError(null);
    try {
      await rejectPoiSuggestion(rejectId, { reason: rejectReason.trim() || undefined });
      setRejectId(null);
      setRejectReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec refus");
    } finally {
      setActing(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Lieux & POI"
        subtitle="Suggestions utilisateurs — validation avant publication dans l'autocomplétion MOVA"
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="flex flex-wrap gap-2 mb-4">
        {(["PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              status === s ? "bg-[#6C63FF] text-white border-[#6C63FF]" : "bg-white border-gray-200"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState message={`Aucune suggestion ${STATUS_LABELS[status]?.toLowerCase() ?? ""}.`} />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-semibold text-lg">{item.name}</p>
                  <p className="text-sm text-gray-600">
                    {CATEGORY_LABELS[item.category] ?? item.category} · {item.city}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                    {item.address ? ` · ${item.address}` : ""}
                  </p>
                  {item.notes && <p className="text-sm mt-2 text-gray-700">Note : {item.notes}</p>}
                  {item.rejectionReason && (
                    <p className="text-sm mt-1 text-red-600">Motif refus : {item.rejectionReason}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Utilisateur {item.userId.slice(0, 8)}… · {new Date(item.createdAt).toLocaleString("fr-CD")}
                  </p>
                </div>
                {item.status === "PENDING" && !readOnly && (
                  <div className="flex flex-col gap-2 min-w-[140px]">
                    <BtnPrimary
                      label={acting === item.id ? "…" : "Publier"}
                      onClick={() => handleApprove(item.id)}
                      disabled={acting != null}
                    />
                    <button
                      type="button"
                      className="text-sm text-red-600 underline"
                      onClick={() => {
                        setRejectId(item.id);
                        setRejectReason("");
                      }}
                    >
                      Refuser
                    </button>
                    <a
                      href={`https://www.openstreetmap.org/#map=19/${item.lat}/${item.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#6C63FF] underline"
                    >
                      Voir sur OSM
                    </a>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={rejectId != null} title="Refuser la suggestion" onClose={() => setRejectId(null)}>
        <FieldLabel>Motif (optionnel)</FieldLabel>
        <TextInput value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Doublon, lieu inexistant…" />
        <div className="flex gap-2 mt-4 justify-end">
          <button type="button" className="px-4 py-2 text-sm" onClick={() => setRejectId(null)}>
            Annuler
          </button>
          <BtnPrimary label="Confirmer le refus" onClick={handleReject} disabled={acting != null} />
        </div>
      </Modal>

      <Modal open={osmLink != null} title="Lieu publié dans MOVA" onClose={() => setOsmLink(null)}>
        <p className="text-sm text-gray-700 mb-3">
          Le lieu est maintenant visible dans l&apos;autocomplétion MOVA. Pour l&apos;ajouter aussi à OpenStreetMap
          (Nominatim), ouvrez l&apos;éditeur OSM :
        </p>
        {osmLink && (
          <a href={osmLink} target="_blank" rel="noreferrer" className="text-[#6C63FF] underline break-all">
            {osmLink}
          </a>
        )}
      </Modal>
    </div>
  );
}
