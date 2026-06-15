"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCommunes, updateCommune, type Commune } from "@/lib/api";
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

const SERVICE_AREAS = [
  "Kinshasa", "Lubumbashi", "Goma", "Bukavu", "Kisangani", "Mbuji-Mayi", "Kananga",
  "Matadi", "Boma", "Kolwezi", "Likasi", "Tshikapa", "Mbandaka", "Kindu", "Bunia",
];

export default function ParametresPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("parametres");
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [city, setCity] = useState(SERVICE_AREAS[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Commune | null>(null);
  const [editName, setEditName] = useState("");
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCommunes(await fetchCommunes(city));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => { load(); }, [load]);

  function openEdit(c: Commune) {
    setSelected(c);
    setEditName(c.name);
    setEditLat(String(c.lat ?? ""));
    setEditLng(String(c.lng ?? ""));
  }

  async function saveCommune() {
    if (!selected) return;
    setSaving(true);
    try {
      await updateCommune(selected.id, {
        name: editName.trim(),
        lat: Number(editLat),
        lng: Number(editLng),
      });
      setSelected(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Zones & communes"
        subtitle={`${SERVICE_AREAS.length}+ villes · quartiers seed par ville`}
      />
      <Card className="p-4 mb-4">
        <p className="text-sm text-gray-600 mb-2">Villes desservies (extrait)</p>
        <p className="text-sm">{SERVICE_AREAS.join(" · ")}</p>
      </Card>
      <div className="mb-4 flex flex-wrap gap-2">
        {SERVICE_AREAS.slice(0, 8).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCity(c)}
            className={`px-3 py-1 rounded-full text-sm border ${city === c ? "bg-violet-100 border-violet-400" : "border-gray-200"}`}
          >
            {c}
          </button>
        ))}
      </div>
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : communes.length === 0 ? (
        <EmptyState message="Aucune commune pour cette ville" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Nom</th>
                <th className="p-3">Ville</th>
                <th className="p-3">Coordonnées</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {communes.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.city ?? city}</td>
                  <td className="p-3 text-gray-500 font-mono text-xs">
                    {c.lat?.toFixed(4)}, {c.lng?.toFixed(4)}
                  </td>
                  <td className="p-3">
                    <button type="button" onClick={() => openEdit(c)} className="text-sm text-[#6C63FF] hover:underline">
                      {readOnly ? "Voir" : "Modifier"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={readOnly ? "Détail commune" : "Modifier commune"}>
        {selected && (
          <div className="space-y-4">
            <label><FieldLabel>Nom</FieldLabel><TextInput value={editName} onChange={setEditName} disabled={readOnly} /></label>
            <label><FieldLabel>Latitude</FieldLabel><TextInput value={editLat} onChange={setEditLat} disabled={readOnly} /></label>
            <label><FieldLabel>Longitude</FieldLabel><TextInput value={editLng} onChange={setEditLng} disabled={readOnly} /></label>
            {!readOnly && (
              <BtnPrimary onClick={saveCommune} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</BtnPrimary>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
