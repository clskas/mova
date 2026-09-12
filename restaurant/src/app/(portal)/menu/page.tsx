"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchMenu,
  fetchProfile,
  formatCdf,
  mediaUrl,
  saveMenu,
  uploadMenuPhoto,
  type MenuItem,
  type MenuOptionGroup,
  type MenuSize,
} from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";
import { ImageSourcePicker } from "@/components/ImageSourcePicker";

const emptyDraft = (): MenuItem => ({
  name: "",
  unitPriceCdf: 5000,
  description: "",
  imageUrl: "",
  isAvailable: true,
  sizes: [],
  optionGroups: [],
});

function emptySize(): MenuSize {
  return { label: "", priceCdf: 0 };
}

function emptyGroup(): MenuOptionGroup {
  return { name: "", options: [{ label: "", priceCdf: 0 }] };
}

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [draft, setDraft] = useState<MenuItem>(emptyDraft);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<"draft" | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canOperate, setCanOperate] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [menu, profile] = await Promise.all([fetchMenu(), fetchProfile().catch(() => null)]);
      setItems(menu.menuItems ?? []);
      if (profile) {
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

  async function handlePhoto(file: File, target: "draft" | number) {
    if (!canOperate) {
      setError("Votre compte doit être validé avant de publier le menu.");
      return;
    }
    setUploadingTarget(target);
    setError(null);
    try {
      const photoUrl = await uploadMenuPhoto(file);
      if (target === "draft") {
        setDraft((d) => ({ ...d, imageUrl: photoUrl }));
      } else {
        setItems((prev) =>
          prev.map((item, i) => (i === target ? { ...item, imageUrl: photoUrl } : item)),
        );
      }
    } catch (e) {
      setError(toUserErrorMessage(e, "Upload impossible"));
    } finally {
      setUploadingTarget(null);
    }
  }

  function startEdit(index: number) {
    const item = items[index];
    setEditIndex(index);
    setDraft({
      ...item,
      sizes: item.sizes?.length ? item.sizes.map((s) => ({ ...s })) : [],
      optionGroups: item.optionGroups?.length
        ? item.optionGroups.map((g) => ({
            ...g,
            options: g.options.map((o) => ({ ...o })),
          }))
        : item.options?.length
          ? [{ name: "Suppléments", options: item.options.map((o) => ({ ...o, label: o.label || o.name || "" })) }]
          : [],
    });
    setMessage(null);
  }

  function cancelEdit() {
    setEditIndex(null);
    setDraft(emptyDraft());
  }

  function applyDraft() {
    if (!canOperate) {
      setError("Votre compte doit être validé avant de publier le menu.");
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      setError("Nom du plat requis");
      return;
    }
    if (!draft.unitPriceCdf || draft.unitPriceCdf <= 0) {
      setError("Prix invalide");
      return;
    }
    const sizes = (draft.sizes ?? [])
      .map((s) => ({
        label: (s.label || s.name || "").trim(),
        priceCdf: Math.round(Number(s.priceCdf ?? s.unitPriceCdf ?? 0)),
      }))
      .filter((s) => s.label);
    const optionGroups = (draft.optionGroups ?? [])
      .map((g) => ({
        name: g.name.trim(),
        options: (g.options ?? [])
          .map((o) => ({
            label: (o.label || o.name || "").trim(),
            priceCdf: Math.round(Number(o.priceCdf ?? o.unitPriceCdf ?? 0)),
          }))
          .filter((o) => o.label),
      }))
      .filter((g) => g.name && g.options.length > 0);

    const next: MenuItem = {
      ...draft,
      name,
      unitPriceCdf: Math.round(draft.unitPriceCdf),
      sizes: sizes.length ? sizes : undefined,
      optionGroups: optionGroups.length ? optionGroups : undefined,
      options: optionGroups.length
        ? optionGroups.flatMap((g) => g.options.map((o) => ({ ...o, group: g.name })))
        : undefined,
    };
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
    if (!canOperate) {
      setError("Votre compte doit être validé avant de publier le menu.");
      return;
    }
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
      setError(toUserErrorMessage(e, "Échec enregistrement"));
    } finally {
      setSaving(false);
    }
  }

  const sizes = draft.sizes ?? [];
  const groups = draft.optionGroups ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Menu & photos</h2>
          <p className="text-sm text-gray-500">Plats, tailles et suppléments visibles par les passagers SENGA</p>
        </div>
        <button
          type="button"
          disabled={saving || loading || !canOperate}
          onClick={persist}
          className="px-5 py-2.5 rounded-xl bg-[#FF6B35] text-white text-sm font-medium disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Publier le menu"}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>}
      {message && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4 text-sm">{message}</div>}
      {!canOperate && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 text-sm">
          Votre compte doit être validé avant de publier le menu. Ouvrez{" "}
          <a href="/dossier" className="underline font-medium">
            Mon dossier
          </a>{" "}
          pour envoyer vos justificatifs.
        </div>
      )}

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
            <span className="text-gray-600">Prix de base (FC)</span>
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

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Tailles</h4>
            <button
              type="button"
              disabled={!canOperate}
              className="text-xs text-[#6C63FF] underline disabled:opacity-60"
              onClick={() => setDraft({ ...draft, sizes: [...sizes, emptySize()] })}
            >
              + Ajouter une taille
            </button>
          </div>
          {sizes.length === 0 ? (
            <p className="text-xs text-gray-400">Ex. Petite / Grande avec prix dédié</p>
          ) : (
            sizes.map((size, si) => (
              <div key={si} className="grid grid-cols-[1fr_120px_auto] gap-2">
                <input
                  className="rounded-xl border p-2 text-sm"
                  placeholder="Libellé (ex. Grande)"
                  value={size.label}
                  onChange={(e) => {
                    const next = [...sizes];
                    next[si] = { ...next[si], label: e.target.value };
                    setDraft({ ...draft, sizes: next });
                  }}
                />
                <input
                  type="number"
                  min={0}
                  className="rounded-xl border p-2 text-sm"
                  placeholder="Prix FC"
                  value={size.priceCdf ?? ""}
                  onChange={(e) => {
                    const next = [...sizes];
                    next[si] = { ...next[si], priceCdf: Number(e.target.value) };
                    setDraft({ ...draft, sizes: next });
                  }}
                />
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={() => setDraft({ ...draft, sizes: sizes.filter((_, i) => i !== si) })}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Groupes d&apos;options / suppléments</h4>
            <button
              type="button"
              disabled={!canOperate}
              className="text-xs text-[#6C63FF] underline disabled:opacity-60"
              onClick={() => setDraft({ ...draft, optionGroups: [...groups, emptyGroup()] })}
            >
              + Ajouter un groupe
            </button>
          </div>
          {groups.map((group, gi) => (
            <div key={gi} className="rounded-xl border p-3 space-y-2 bg-orange-50/40">
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl border p-2 text-sm"
                  placeholder="Nom du groupe (ex. Suppléments)"
                  value={group.name}
                  onChange={(e) => {
                    const next = [...groups];
                    next[gi] = { ...next[gi], name: e.target.value };
                    setDraft({ ...draft, optionGroups: next });
                  }}
                />
                <button
                  type="button"
                  className="text-xs text-red-600 shrink-0"
                  onClick={() => setDraft({ ...draft, optionGroups: groups.filter((_, i) => i !== gi) })}
                >
                  Supprimer
                </button>
              </div>
              {(group.options ?? []).map((opt, oi) => (
                <div key={oi} className="grid grid-cols-[1fr_100px_auto] gap-2">
                  <input
                    className="rounded-xl border p-2 text-sm"
                    placeholder="Option"
                    value={opt.label}
                    onChange={(e) => {
                      const next = [...groups];
                      const opts = [...(next[gi].options ?? [])];
                      opts[oi] = { ...opts[oi], label: e.target.value };
                      next[gi] = { ...next[gi], options: opts };
                      setDraft({ ...draft, optionGroups: next });
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    className="rounded-xl border p-2 text-sm"
                    placeholder="+ FC"
                    value={opt.priceCdf ?? ""}
                    onChange={(e) => {
                      const next = [...groups];
                      const opts = [...(next[gi].options ?? [])];
                      opts[oi] = { ...opts[oi], priceCdf: Number(e.target.value) };
                      next[gi] = { ...next[gi], options: opts };
                      setDraft({ ...draft, optionGroups: next });
                    }}
                  />
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() => {
                      const next = [...groups];
                      next[gi] = {
                        ...next[gi],
                        options: (next[gi].options ?? []).filter((_, i) => i !== oi),
                      };
                      setDraft({ ...draft, optionGroups: next });
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-[#6C63FF] underline"
                onClick={() => {
                  const next = [...groups];
                  next[gi] = {
                    ...next[gi],
                    options: [...(next[gi].options ?? []), { label: "", priceCdf: 0 }],
                  };
                  setDraft({ ...draft, optionGroups: next });
                }}
              >
                + Option
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <ImageSourcePicker
            disabled={!canOperate || uploadingTarget !== null}
            onSelect={(file) => handlePhoto(file, "draft")}
            label={uploadingTarget === "draft" ? "Upload…" : "Photo du plat"}
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
                {(item.sizes?.length || item.optionGroups?.length || item.options?.length) ? (
                  <p className="text-[11px] text-gray-500 mt-1">
                    {item.sizes?.length ? `${item.sizes.length} taille(s)` : null}
                    {item.sizes?.length && (item.optionGroups?.length || item.options?.length) ? " · " : null}
                    {item.optionGroups?.length
                      ? `${item.optionGroups.length} groupe(s)`
                      : item.options?.length
                        ? `${item.options.length} option(s)`
                        : null}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 mt-3">
                  <button type="button" disabled={!canOperate} onClick={() => startEdit(index)} className="text-xs text-[#6C63FF] underline disabled:opacity-60">
                    Modifier
                  </button>
                  <ImageSourcePicker
                    disabled={!canOperate || uploadingTarget !== null}
                    onSelect={(file) => handlePhoto(file, index)}
                    label={uploadingTarget === index ? "Upload…" : "Photo"}
                    className="text-xs text-gray-600 underline disabled:opacity-60"
                    accept="image/jpeg,image/png,image/webp"
                  />
                  <button type="button" disabled={!canOperate} onClick={() => removeItem(index)} className="text-xs text-red-600 underline disabled:opacity-60">
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
