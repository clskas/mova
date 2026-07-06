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

type OsmContribution = {
  editUrl: string;
  viewUrl: string;
  tags: Record<string, string>;
  instructions: string;
};

function osmLinks(item: PoiSuggestion): OsmContribution {
  const fromApi = (item as PoiSuggestion & { osm?: OsmContribution }).osm;
  if (fromApi?.editUrl) {
    return {
      ...fromApi,
      viewUrl: fromApi.viewUrl ?? `https://www.openstreetmap.org/#map=19/${item.lat}/${item.lng}`,
    };
  }
  const amenity: Record<string, string> = {
    MARKET: "marketplace",
    HOSPITAL: "hospital",
    UNIVERSITY: "university",
    PHARMACY: "pharmacy",
    SCHOOL: "school",
    GOVERNMENT: "townhall",
    TRANSPORT: "bus_station",
  };
  const tags: Record<string, string> = { name: item.name };
  const tag = amenity[item.category];
  if (tag) tags.amenity = tag;
  return {
    editUrl: `https://www.openstreetmap.org/edit#map=19/${item.lat}/${item.lng}`,
    viewUrl: `https://www.openstreetmap.org/#map=19/${item.lat}/${item.lng}`,
    tags,
    instructions:
      "Ouvrez l'éditeur OSM, ajoutez un point à ces coordonnées, copiez les tags suggérés. Nominatim indexera le lieu sous 24–48 h.",
  };
}

function OsmLinksPanel({ item }: { item: PoiSuggestion }) {
  const osm = osmLinks(item);
  const tagLine = Object.entries(osm.tags)
    .map(([k, v]) => `${k}=${v}`)
    .join(" · ");

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 text-xs space-y-2">
      <p className="text-gray-500">
        {item.status === "APPROVED"
          ? "Publié dans l'autocomplétion MOVA. OpenStreetMap est une base séparée — le lieu n'y apparaît que si vous le créez manuellement."
          : "La carte OSM affiche seulement la position GPS, pas encore le lieu nommé."}
      </p>
      <div className="flex flex-wrap gap-3">
        <a href={osm.viewUrl} target="_blank" rel="noreferrer" className="text-gray-600 underline">
          Carte OSM (position)
        </a>
        <a href={osm.editUrl} target="_blank" rel="noreferrer" className="text-[#6C63FF] underline font-medium">
          Éditeur OSM — ajouter le lieu
        </a>
      </div>
      <p className="text-gray-400 font-mono break-all">Tags suggérés : {tagLine}</p>
    </div>
  );
}

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
  const [osmModal, setOsmModal] = useState<OsmContribution | null>(null);

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
      const item = items.find((i) => i.id === id);
      const osm = result?.osm as OsmContribution | undefined;
      if (osm?.editUrl) {
        setOsmModal({
          ...osm,
          viewUrl: osm.viewUrl ?? (item ? `https://www.openstreetmap.org/#map=19/${item.lat}/${item.lng}` : osm.editUrl),
        });
      } else if (item) {
        setOsmModal(osmLinks(item));
      }
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
        subtitle="Validation MOVA — publication dans l'autocomplétion de l'app (distinct d'OpenStreetMap)"
      />

      <Card className="mb-4 bg-violet-50 border-violet-100">
        <p className="text-sm text-gray-800 leading-relaxed">
          <strong>Publier</strong> ajoute le lieu dans la base MOVA (recherche d&apos;adresses, carte Taxi).
          <br />
          <strong>OpenStreetMap</strong> n&apos;est pas mis à jour automatiquement : le lien « Éditeur OSM » permet à un
          contributeur de créer le point manuellement. Tant que ce n&apos;est pas fait, « Carte OSM » ne montre que les
          coordonnées, pas le nom du lieu.
        </p>
      </Card>

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
                <div className="flex-1 min-w-[240px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-lg">{item.name}</p>
                    {item.status === "APPROVED" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">MOVA</span>
                    )}
                  </div>
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
                  <OsmLinksPanel item={item} />
                </div>
                {item.status === "PENDING" && !readOnly && (
                  <div className="flex flex-col gap-2 min-w-[140px]">
                    <BtnPrimary
                      onClick={() => handleApprove(item.id)}
                      disabled={acting != null}
                    >
                      {acting === item.id ? "…" : "Publier dans MOVA"}
                    </BtnPrimary>
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
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={rejectId != null} title="Refuser la suggestion" onClose={() => setRejectId(null)}>
        <FieldLabel>Motif (optionnel)</FieldLabel>
        <TextInput value={rejectReason} onChange={setRejectReason} placeholder="Doublon, lieu inexistant…" />
        <div className="flex gap-2 mt-4 justify-end">
          <button type="button" className="px-4 py-2 text-sm" onClick={() => setRejectId(null)}>
            Annuler
          </button>
          <BtnPrimary onClick={handleReject} disabled={acting != null}>
            Confirmer le refus
          </BtnPrimary>
        </div>
      </Modal>

      <Modal open={osmModal != null} title="Lieu publié dans MOVA" onClose={() => setOsmModal(null)}>
        <p className="text-sm text-gray-700 mb-3">
          Le lieu est visible dans l&apos;app MOVA (autocomplétion et carte). Pour l&apos;ajouter aussi sur
          OpenStreetMap, ouvrez l&apos;éditeur et créez un point aux coordonnées indiquées :
        </p>
        {osmModal && (
          <>
            <a href={osmModal.editUrl} target="_blank" rel="noreferrer" className="text-[#6C63FF] underline break-all block mb-3">
              {osmModal.editUrl}
            </a>
            <p className="text-xs text-gray-500 font-mono mb-2">
              Tags :{" "}
              {Object.entries(osmModal.tags)
                .map(([k, v]) => `${k}=${v}`)
                .join(" · ")}
            </p>
            <p className="text-xs text-gray-500">{osmModal.instructions}</p>
          </>
        )}
      </Modal>
    </div>
  );
}
