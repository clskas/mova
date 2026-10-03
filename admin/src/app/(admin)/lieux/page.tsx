"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approvePoiSuggestion,
  fetchPoiCatalog,
  fetchPoiSuggestions,
  rejectPoiSuggestion,
  seedPoiCatalog,
  updatePoiCatalog,
  type CatalogPoi,
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
  SelectInput,
  TextInput,
} from "@/components/ui";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  APPROVED: "Publié",
  REJECTED: "Refusé",
  CATALOG: "Catalogue",
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

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

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
          ? "Publié dans l'autocomplétion SENGA. OpenStreetMap est une base séparée — le lieu n'y apparaît que si vous le créez manuellement."
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
  const { canWrite, role, user } = useAdmin();
  const readOnly = !canWrite("lieux");
  const managedCity = role === "CITY_ADMIN" ? user?.managedCity?.trim() || null : null;
  const [tab, setTab] = useState<"PENDING" | "APPROVED" | "REJECTED" | "CATALOG">("PENDING");
  const [items, setItems] = useState<PoiSuggestion[]>([]);
  const [catalog, setCatalog] = useState<CatalogPoi[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogQ, setCatalogQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [osmModal, setOsmModal] = useState<OsmContribution | null>(null);
  const [seedingPoi, setSeedingPoi] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [editPoi, setEditPoi] = useState<CatalogPoi | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCategory, setEditCategory] = useState("OTHER");
  const [editCity, setEditCity] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "CATALOG") {
        const data = await fetchPoiCatalog({
          city: managedCity ?? undefined,
          q: catalogQ,
          take: 120,
        });
        setCatalog(data.items ?? []);
        setCatalogTotal(data.total ?? 0);
        setItems([]);
      } else {
        const data = await fetchPoiSuggestions(tab);
        setItems(data.items ?? []);
        setCatalog([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [tab, catalogQ, managedCity]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(poi: CatalogPoi) {
    setEditPoi(poi);
    setEditName(poi.name);
    setEditAddress(poi.address ?? "");
    setEditCategory(poi.category);
    setEditCity(poi.city);
  }

  async function handleSaveEdit() {
    if (!editPoi) return;
    const name = editName.trim();
    if (name.length < 2) {
      setError("Le nom du lieu doit faire au moins 2 caractères.");
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      await updatePoiCatalog(editPoi.id, {
        name,
        address: editAddress.trim() || null,
        category: editCategory,
        city: editCity.trim(),
      });
      setEditPoi(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec modification");
    } finally {
      setSavingEdit(false);
    }
  }

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

  async function handleSeedCatalog() {
    const cityLabel = managedCity ?? "toutes les villes SENGA";
    const confirmMsg = managedCity
      ? `Synchroniser le catalogue POI pour ${managedCity} uniquement ?`
      : "Synchroniser tous les POI du catalogue SENGA (toutes villes) ?";
    if (!confirm(confirmMsg)) return;
    setSeedingPoi(true);
    setSeedResult(null);
    setError(null);
    try {
      const result = await seedPoiCatalog(managedCity ?? "RDC");
      setSeedResult(`${result.imported} ajouté(s), ${result.skipped} déjà présent(s) — ${cityLabel}`);
      if (tab === "CATALOG") await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec synchronisation POI");
    } finally {
      setSeedingPoi(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Lieux & POI"
        subtitle={
          managedCity
            ? `Validation SENGA — périmètre ${managedCity} (autocomplétion app, distinct d'OpenStreetMap)`
            : "Validation SENGA — publication dans l'autocomplétion de l'app (distinct d'OpenStreetMap)"
        }
      />

      {managedCity && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          Périmètre admin ville : <strong>{managedCity}</strong> — seules les suggestions de cette ville
          sont listées ; la synchronisation catalogue ne touche que {managedCity}.
        </div>
      )}

      <Card className="mb-4 bg-violet-50 border-violet-100">
        <p className="text-sm text-gray-800 leading-relaxed">
          <strong>Publier</strong> ajoute le lieu dans la base SENGA (recherche d&apos;adresses, carte Taxi).
          <br />
          L&apos;onglet <strong>Catalogue</strong> liste les lieux déjà en base (table places_of_interest) — vous pouvez y
          modifier le nom affiché dans l&apos;app.
        </p>
      </Card>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {!readOnly && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <BtnPrimary onClick={handleSeedCatalog} disabled={seedingPoi}>
            {seedingPoi
              ? "Synchronisation…"
              : managedCity
                ? `Synchroniser catalogue POI (${managedCity})`
                : "Synchroniser catalogue POI (toutes villes)"}
          </BtnPrimary>
          {seedResult && <span className="text-sm text-green-700">{seedResult}</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {(["PENDING", "APPROVED", "REJECTED", "CATALOG"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              tab === s ? "bg-[#6C63FF] text-white border-[#6C63FF]" : "bg-white border-gray-200"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {tab === "CATALOG" && (
        <div className="mb-4 max-w-md">
          <TextInput
            value={catalogQ}
            onChange={setCatalogQ}
            placeholder="Rechercher un lieu (nom ou adresse)…"
          />
          <p className="text-xs text-gray-500 mt-1">{catalogTotal} lieu{catalogTotal > 1 ? "x" : ""} dans le catalogue</p>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : tab === "CATALOG" ? (
        catalog.length === 0 ? (
          <EmptyState message="Aucun lieu dans le catalogue. Utilisez « Synchroniser catalogue POI »." />
        ) : (
          <div className="space-y-3">
            {catalog.map((poi) => (
              <Card key={poi.id}>
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="flex-1 min-w-[240px]">
                    <p className="font-semibold text-lg">{poi.name}</p>
                    <p className="text-sm text-gray-600">
                      {CATEGORY_LABELS[poi.category] ?? poi.category} · {poi.city}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
                      {poi.address ? ` · ${poi.address}` : ""}
                    </p>
                    {poi.source && <p className="text-xs text-gray-400 mt-1">Source : {poi.source}</p>}
                  </div>
                  {!readOnly && (
                    <BtnPrimary onClick={() => openEdit(poi)}>Modifier</BtnPrimary>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <EmptyState message={`Aucune suggestion ${STATUS_LABELS[tab]?.toLowerCase() ?? ""}.`} />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-lg">{item.name}</p>
                    {item.status === "APPROVED" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">SENGA</span>
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
                    <BtnPrimary onClick={() => handleApprove(item.id)} disabled={acting != null}>
                      {acting === item.id ? "…" : "Publier dans SENGA"}
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

      <Modal open={editPoi != null} title="Modifier le lieu" onClose={() => setEditPoi(null)}>
        <FieldLabel>Nom affiché dans l&apos;app</FieldLabel>
        <TextInput value={editName} onChange={setEditName} placeholder="Ex. Marché Central" />
        <div className="mt-3">
          <FieldLabel>Adresse (optionnel)</FieldLabel>
          <TextInput value={editAddress} onChange={setEditAddress} placeholder="Quartier, avenue…" />
        </div>
        <div className="mt-3">
          <FieldLabel>Catégorie</FieldLabel>
          <SelectInput value={editCategory} onChange={setEditCategory} options={CATEGORY_OPTIONS} />
        </div>
        <div className="mt-3">
          <FieldLabel>Ville</FieldLabel>
          <TextInput value={editCity} onChange={setEditCity} disabled={managedCity != null} />
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <button type="button" className="px-4 py-2 text-sm" onClick={() => setEditPoi(null)}>
            Annuler
          </button>
          <BtnPrimary onClick={() => void handleSaveEdit()} disabled={savingEdit}>
            {savingEdit ? "Enregistrement…" : "Enregistrer"}
          </BtnPrimary>
        </div>
      </Modal>

      <Modal open={osmModal != null} title="Lieu publié dans SENGA" onClose={() => setOsmModal(null)}>
        <p className="text-sm text-gray-700 mb-3">
          Le lieu est visible dans l&apos;app SENGA (autocomplétion et carte). Pour l&apos;ajouter aussi sur
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
