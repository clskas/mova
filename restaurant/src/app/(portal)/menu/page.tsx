"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PortalShell } from "@/components/PortalShell";
import {
  fetchMenu,
  fetchProfile,
  formatCdf,
  mediaUrl,
  saveMenu,
  uploadMenuPhoto,
  type MenuItem,
} from "@/lib/api";

const emptyDraft = (): MenuItem => ({
  name: "",
  unitPriceCdf: 5000,
  description: "",
  imageUrl: "",
  isAvailable: true,
});

export default function MenuPage() {
  const [restaurantName, setRestaurantName] = useState<string>();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [draft, setDraft] = useState<MenuItem>(emptyDraft);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<"draft" | number>("draft");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profile, menu] = await Promise.all([fetchProfile(), fetchMenu()]);
      setRestaurantName(profile.name);
      setItems(menu.menuItems ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const photoUrl = await uploadMenuPhoto(file);
      if (uploadTarget === "draft") {
        setDraft((d) => ({ ...d, imageUrl: photoUrl }));
      } else {
        setItems((prev) =>
          prev.map((item, i) => (i === uploadTarget ? { ...item, imageUrl: photoUrl } : item)),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload impossible");
    } finally {
      setUploading(false);
    }
  }

  function startEdit(index: number) {
    setEditIndex(index);
    setDraft({ ...items[index] });
    setMessage(null);
  }

  function cancelEdit() {
    setEditIndex(null);
    setDraft(emptyDraft());
  }

  function applyDraft() {
    const name = draft.name.trim();
    if (!name) {
      setError("Nom du plat requis");
      return;
    }
    if (!draft.unitPriceCdf || draft.unitPriceCdf <= 0) {
      setError("Prix invalide");
      return;
    }
    const next = { ...draft, name, unitPriceCdf: Math.round(draft.unitPriceCdf) };
    if (editIndex != null) {
      setItems((prev) => prev.map((item, i) => (i === editIndex ? next : item)));
    } else {
      setItems((prev) => [...prev, next]);
    }
    setEditIndex(null);
    setDraft(emptyDraft());
    setError(null);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    if (editIndex === index) cancelEdit();
  }

  async function persist() {
    if (items.length === 0) {
      setError("Ajoutez au moins un plat");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await saveMenu(items);
      setItems(result.menuItems ?? items);
      setMessage("Menu enregistré — visible dans l'app passager");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement");
    } finally {
      setSaving(false);
    }
  }

  function openFilePicker(target: "draft" | number) {
    setUploadTarget(target);
    fileRef.current?.click();
  }

  return (
    <PortalShell restaurantName={restaurantName}>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handlePhoto(file);
        }}
      />

      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Menu & photos</h2>
            <p className="text-sm text-gray-500">Plats visibles par les passagers MOVA</p>
          </div>
          <button
            type="button"
            disabled={saving || loading}
            onClick={persist}
            className="px-5 py-2.5 rounded-xl bg-[#FF6B35] text-white text-sm font-medium disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Publier le menu"}
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>}
        {message && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4 text-sm">{message}</div>}

        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <h3 className="font-semibold">{editIndex != null ? "Modifier le plat" : "Ajouter un plat"}</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-gray-600">Nom du plat</span>
              <input
                className="mt-1 w-full rounded-xl border p-3"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ex. Poulet moambe"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Prix (FC)</span>
              <input
                type="number"
                min={100}
                className="mt-1 w-full rounded-xl border p-3"
                value={draft.unitPriceCdf}
                onChange={(e) => setDraft({ ...draft, unitPriceCdf: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-gray-600">Description (optionnel)</span>
            <input
              className="mt-1 w-full rounded-xl border p-3"
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Ex. Servi avec fufu"
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={uploading}
              onClick={() => openFilePicker("draft")}
              className="px-4 py-2 rounded-xl border text-sm hover:bg-gray-50 disabled:opacity-60"
            >
              {uploading && uploadTarget === "draft" ? "Upload…" : "Photo du plat"}
            </button>
            {draft.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(draft.imageUrl) ?? ""} alt="" className="w-16 h-16 rounded-lg object-cover border" />
            )}
            <label className="flex items-center gap-2 text-sm ml-auto">
              <input
                type="checkbox"
                checked={draft.isAvailable !== false}
                onChange={(e) => setDraft({ ...draft, isAvailable: e.target.checked })}
              />
              Disponible
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={applyDraft} className="px-4 py-2 rounded-xl bg-[#6C63FF] text-white text-sm">
              {editIndex != null ? "Mettre à jour" : "Ajouter au menu"}
            </button>
            {editIndex != null && (
              <button type="button" onClick={cancelEdit} className="px-4 py-2 rounded-xl border text-sm">
                Annuler
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-8">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="text-gray-400 text-center py-8 bg-white rounded-2xl border">Aucun plat — ajoutez votre premier article</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="bg-white rounded-2xl border p-4 flex gap-3">
                <div className="w-20 h-20 shrink-0 rounded-xl bg-orange-50 border overflow-hidden flex items-center justify-center">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(item.imageUrl) ?? ""} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">🍽️</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold truncate">{item.name}</p>
                    {item.isAvailable === false && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded shrink-0">Indispo.</span>
                    )}
                  </div>
                  <p className="text-[#6C63FF] text-sm font-medium">{formatCdf(item.unitPriceCdf)}</p>
                  {item.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>}
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button type="button" onClick={() => startEdit(index)} className="text-xs text-[#6C63FF] underline">
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => openFilePicker(index)}
                      className="text-xs text-gray-600 underline"
                    >
                      Photo
                    </button>
                    <button type="button" onClick={() => removeItem(index)} className="text-xs text-red-600 underline">
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
