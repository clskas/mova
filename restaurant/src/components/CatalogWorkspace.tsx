"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchMenu,
  fetchProfile,
  formatCdf,
  mediaUrl,
  saveMenu,
  uploadMenuPhoto,
  type MenuCategory,
  type MenuItem,
} from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";
import { ImageSourcePicker } from "@/components/ImageSourcePicker";
import { COMMERCE_TYPE_LABELS_FR, parseCommerceType, type CommerceType } from "@/lib/commerce-type";

export type CatalogMode = "catalogue" | "stock" | "restrictions";

function newCategoryId(name: string) {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `cat-${slug || "cat"}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyItem(): MenuItem {
  return {
    name: "",
    unitPriceCdf: 1000,
    description: "",
    imageUrl: "",
    isAvailable: true,
    stockQty: null,
    ageRestricted: false,
    requiresPrescription: false,
  };
}

const COPY: Record<
  CatalogMode,
  { title: string; subtitle: (type: CommerceType) => string; publish: string }
> = {
  catalogue: {
    title: "Catalogue",
    subtitle: (t) =>
      t === "PHARMACY"
        ? "Produits et catégories de votre pharmacie"
        : "Produits et catégories visibles dans SENGA",
    publish: "Publier le catalogue",
  },
  stock: {
    title: "Stock",
    subtitle: () => "Quantités en stock (laissez vide = illimité)",
    publish: "Enregistrer le stock",
  },
  restrictions: {
    title: "Restrictions",
    subtitle: () => "Âge minimum et produits sous ordonnance",
    publish: "Enregistrer les restrictions",
  },
};

export function CatalogWorkspace({ mode }: { mode: CatalogMode }) {
  const [commerceType, setCommerceType] = useState<CommerceType>("SUPERMARKET");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [draft, setDraft] = useState<MenuItem>(emptyItem);
  const [newCatName, setNewCatName] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canOperate, setCanOperate] = useState(true);

  const copy = COPY[mode];

  const load = useCallback(async () => {
    setError(null);
    try {
      const [menu, profile] = await Promise.all([fetchMenu(), fetchProfile().catch(() => null)]);
      setItems(menu.menuItems ?? menu.catalog?.items ?? []);
      setCategories(menu.categories ?? menu.catalog?.categories ?? []);
      if (profile) {
        setCommerceType(parseCommerceType(profile.commerceType));
        setCanOperate(profile.canOperate !== false && profile.kycStatus !== "PENDING" && profile.kycStatus !== "REJECTED");
      }
    } catch (e) {
      setError(toUserErrorMessage(e, "Erreur de chargement"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return (id?: string) => (id ? map.get(id) : undefined);
  }, [categories]);

  function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setCategories((prev) => [
      ...prev,
      { id: newCategoryId(name), name, sortOrder: prev.length },
    ]);
    setNewCatName("");
  }

  function removeCategory(id: string) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setItems((prev) =>
      prev.map((item) => (item.categoryId === id ? { ...item, categoryId: undefined } : item)),
    );
  }

  function startEdit(index: number) {
    setEditIndex(index);
    setDraft({ ...items[index] });
    setMessage(null);
  }

  function cancelEdit() {
    setEditIndex(null);
    setDraft(emptyItem());
  }

  function applyDraft() {
    if (!canOperate) {
      setError("Votre compte doit être validé avant de publier.");
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      setError("Nom du produit requis");
      return;
    }
    if (!draft.unitPriceCdf || draft.unitPriceCdf <= 0) {
      setError("Prix invalide");
      return;
    }
    const next: MenuItem = {
      ...draft,
      name,
      unitPriceCdf: Math.round(draft.unitPriceCdf),
      stockQty:
        draft.stockQty === null || draft.stockQty === undefined || String(draft.stockQty) === ""
          ? null
          : Math.max(0, Math.round(Number(draft.stockQty))),
      ageRestricted: draft.ageRestricted === true,
      requiresPrescription: draft.requiresPrescription === true,
    };
    if (editIndex != null) {
      setItems((prev) => prev.map((item, i) => (i === editIndex ? next : item)));
    } else {
      setItems((prev) => [...prev, next]);
    }
    setEditIndex(null);
    setDraft(emptyItem());
    setError(null);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    if (editIndex === index) cancelEdit();
  }

  function patchItem(index: number, patch: Partial<MenuItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function handlePhoto(file: File) {
    if (!canOperate) return;
    setUploading(true);
    setError(null);
    try {
      const photoUrl = await uploadMenuPhoto(file);
      setDraft((d) => ({ ...d, imageUrl: photoUrl }));
    } catch (e) {
      setError(toUserErrorMessage(e, "Upload impossible"));
    } finally {
      setUploading(false);
    }
  }

  async function persist() {
    if (!canOperate) {
      setError("Votre compte doit être validé avant de publier.");
      return;
    }
    if (items.length === 0) {
      setError("Ajoutez au moins un produit");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await saveMenu(items, categories);
      setItems(result.menuItems ?? items);
      setCategories(result.categories ?? categories);
      setMessage("Catalogue enregistré — visible dans l'app passager");
    } catch (e) {
      setError(toUserErrorMessage(e, "Échec enregistrement"));
    } finally {
      setSaving(false);
    }
  }

  const showFullForm = mode === "catalogue";
  const showRxFields = mode === "catalogue" || mode === "restrictions";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{copy.title}</h2>
          <p className="text-sm text-gray-500">
            {copy.subtitle(commerceType)} · {COMMERCE_TYPE_LABELS_FR[commerceType]}
          </p>
        </div>
        <button
          type="button"
          disabled={saving || loading || !canOperate}
          onClick={persist}
          className="px-5 py-2.5 rounded-xl bg-[#FF6B35] text-white text-sm font-medium disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : copy.publish}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>}
      {message && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4 text-sm">{message}</div>}
      {!canOperate && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 text-sm">
          Votre compte doit être validé. Ouvrez{" "}
          <a href="/dossier" className="underline font-medium">
            Mon dossier
          </a>
          .
        </div>
      )}

      {(mode === "catalogue" || mode === "stock") && (
        <div className="bg-white rounded-2xl border p-5 space-y-3">
          <h3 className="font-semibold">Catégories</h3>
          <div className="flex flex-wrap gap-2">
            {categories.length === 0 && <p className="text-sm text-gray-400">Aucune catégorie</p>}
            {categories.map((cat) => (
              <span
                key={cat.id}
                className="inline-flex items-center gap-2 rounded-full bg-orange-50 border border-orange-100 px-3 py-1 text-sm"
              >
                {cat.name}
                {mode === "catalogue" && (
                  <button type="button" className="text-red-600 text-xs" onClick={() => removeCategory(cat.id)} disabled={!canOperate}>
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          {mode === "catalogue" && (
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border p-3 text-sm"
                placeholder="Nouvelle catégorie (ex. Boissons)"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
              />
              <button type="button" disabled={!canOperate} onClick={addCategory} className="px-4 py-2 rounded-xl border text-sm disabled:opacity-60">
                Ajouter
              </button>
            </div>
          )}
        </div>
      )}

      {showFullForm && (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <h3 className="font-semibold">{editIndex != null ? "Modifier le produit" : "Ajouter un produit"}</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-gray-600">Nom</span>
              <input
                className="mt-1 w-full rounded-xl border p-3"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
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
            <label className="block text-sm">
              <span className="text-gray-600">Catégorie</span>
              <select
                className="mt-1 w-full rounded-xl border p-3"
                value={draft.categoryId ?? ""}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || undefined })}
              >
                <option value="">— Sans catégorie —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Stock (vide = illimité)</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-xl border p-3"
                value={draft.stockQty ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    stockQty: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="Illimité"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-gray-600">Description</span>
            <input
              className="mt-1 w-full rounded-xl border p-3"
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          {(commerceType === "PHARMACY" || showRxFields) && (
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.ageRestricted === true}
                  onChange={(e) => setDraft({ ...draft, ageRestricted: e.target.checked })}
                />
                Restriction d&apos;âge
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.requiresPrescription === true}
                  onChange={(e) => setDraft({ ...draft, requiresPrescription: e.target.checked })}
                />
                Ordonnance requise
              </label>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <ImageSourcePicker
              disabled={!canOperate || uploading}
              onSelect={handlePhoto}
              label={uploading ? "Upload…" : "Photo"}
              accept="image/jpeg,image/png,image/webp"
            />
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
            <button type="button" disabled={!canOperate} onClick={applyDraft} className="px-4 py-2 rounded-xl bg-[#6C63FF] text-white text-sm disabled:opacity-60">
              {editIndex != null ? "Mettre à jour" : "Ajouter"}
            </button>
            {editIndex != null && (
              <button type="button" onClick={cancelEdit} className="px-4 py-2 rounded-xl border text-sm">
                Annuler
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-center py-8">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-gray-400 text-center py-8 bg-white rounded-2xl border">Aucun produit</p>
      ) : mode === "stock" ? (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-orange-50 text-left">
              <tr>
                <th className="p-3 font-medium">Produit</th>
                <th className="p-3 font-medium">Catégorie</th>
                <th className="p-3 font-medium w-40">Stock</th>
                <th className="p-3 font-medium">Dispo.</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.name}-${index}`} className="border-t">
                  <td className="p-3">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-gray-500">{formatCdf(item.unitPriceCdf)}</p>
                  </td>
                  <td className="p-3 text-gray-600">{categoryName(item.categoryId) ?? "—"}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      min={0}
                      disabled={!canOperate}
                      className="w-full rounded-lg border p-2"
                      value={item.stockQty ?? ""}
                      placeholder="∞"
                      onChange={(e) =>
                        patchItem(index, {
                          stockQty: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      disabled={!canOperate}
                      checked={item.isAvailable !== false}
                      onChange={(e) => patchItem(index, { isAvailable: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : mode === "restrictions" ? (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-orange-50 text-left">
              <tr>
                <th className="p-3 font-medium">Produit</th>
                <th className="p-3 font-medium">Âge</th>
                <th className="p-3 font-medium">Ordonnance</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.name}-${index}`} className="border-t">
                  <td className="p-3">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-gray-500">{formatCdf(item.unitPriceCdf)}</p>
                  </td>
                  <td className="p-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={!canOperate}
                        checked={item.ageRestricted === true}
                        onChange={(e) => patchItem(index, { ageRestricted: e.target.checked })}
                      />
                      Restriction d&apos;âge
                    </label>
                  </td>
                  <td className="p-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={!canOperate}
                        checked={item.requiresPrescription === true}
                        onChange={(e) => patchItem(index, { requiresPrescription: e.target.checked })}
                      />
                      Ordonnance
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-3 text-xs text-gray-500 border-t">
            Les produits sous ordonnance exigent une confirmation du client à la commande. SENGA ne vérifie pas
            l&apos;ordonnance médicale automatiquement.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="bg-white rounded-2xl border p-4 flex gap-3">
              <div className="w-16 h-16 shrink-0 rounded-xl bg-orange-50 border overflow-hidden flex items-center justify-center">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(item.imageUrl) ?? ""} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">📦</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{item.name}</p>
                <p className="text-[#6C63FF] text-sm">{formatCdf(item.unitPriceCdf)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {categoryName(item.categoryId) ?? "Sans catégorie"}
                  {typeof item.stockQty === "number" ? ` · Stock ${item.stockQty}` : " · Illimité"}
                  {item.ageRestricted ? " · Âge" : ""}
                  {item.requiresPrescription ? " · Ordonnance" : ""}
                </p>
                <div className="flex gap-2 mt-2">
                  <button type="button" disabled={!canOperate} className="text-xs text-[#6C63FF] underline" onClick={() => startEdit(index)}>
                    Modifier
                  </button>
                  <button type="button" disabled={!canOperate} className="text-xs text-red-600 underline" onClick={() => removeItem(index)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
