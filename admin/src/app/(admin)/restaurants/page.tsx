"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, deleteRestaurant, fetchUsers, formatUserName, saveRestaurant, type AdminUser, type Restaurant } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnDanger,
  BtnGhost,
  BtnPrimary,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  FieldLabel,
  LoadingState,
  Modal,
  PageHeader,
  SelectInput,
  TextInput,
} from "@/components/ui";
import { GpsCoordButton } from "@/components/GpsCoordButton";

type MenuItem = {
  name: string;
  priceCdf: number;
  unitPriceCdf?: number;
  description?: string;
  isAvailable?: boolean;
};

function parseMenuItems(raw: unknown): MenuItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === "object")
    .map((e) => {
      const item = e as Record<string, unknown>;
      const price = Number(item.priceCdf ?? item.unitPriceCdf ?? 0);
      return {
        name: String(item.name ?? ""),
        priceCdf: price,
        unitPriceCdf: price,
        description: item.description ? String(item.description) : undefined,
        isAvailable: item.isAvailable !== false,
      };
    })
    .filter((item) => item.name.trim().length > 0);
}

export default function RestaurantsPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("restaurants");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    cuisine: "Congolaise",
    address: "",
    lat: "-4.3217",
    lng: "15.3125",
    ownerUserId: "",
  });
  const [editTarget, setEditTarget] = useState<Restaurant | null>(null);
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Restaurant | null>(null);
  const [saving, setSaving] = useState(false);
  const [partnerUsers, setPartnerUsers] = useState<AdminUser[]>([]);
  const [menuTarget, setMenuTarget] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  const partnerOptions = useMemo(
    () => [
      { value: "", label: "— Aucun compte lié —" },
      ...partnerUsers.map((u) => ({
        value: u.id,
        label: `${formatUserName(u)}${u.phone ? ` · ${u.phone}` : ""}`,
      })),
    ],
    [partnerUsers],
  );

  function partnerLabel(ownerUserId?: string | null) {
    if (!ownerUserId) return "Non lié";
    const user = partnerUsers.find((u) => u.id === ownerUserId);
    if (!user) return ownerUserId.slice(0, 8) + "…";
    return user.phone ? `${formatUserName(user)} (${user.phone})` : formatUserName(user);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, usersRes] = await Promise.all([
        apiFetch<Restaurant[]>("/api/admin/restaurants"),
        fetchUsers(0, 200),
      ]);
      setRestaurants(Array.isArray(data) ? data : []);
      setPartnerUsers((usersRes.data ?? []).filter((u) => u.role === "RESTAURANT" && u.status !== "INACTIVE"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function parseCoord(value: string, fallback: number) {
    const n = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || readOnly) return;
    setSaving(true);
    setError(null);
    try {
      await saveRestaurant({
        name: form.name.trim(),
        cuisine: form.cuisine.trim(),
        address: form.address.trim() || "Kinshasa",
        lat: parseCoord(form.lat, -4.3217),
        lng: parseCoord(form.lng, 15.3125),
        rating: 4.0,
        ...(form.ownerUserId ? { ownerUserId: form.ownerUserId } : {}),
      });
      setForm({ name: "", cuisine: "Congolaise", address: "", lat: "-4.3217", lng: "15.3125", ownerUserId: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur création");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editTarget || readOnly) return;
    setSaving(true);
    try {
      await saveRestaurant(
        {
          name: editTarget.name,
          cuisine: editTarget.cuisine ?? undefined,
          address: editTarget.address ?? undefined,
          lat: parseCoord(editLat, editTarget.lat ?? -4.3217),
          lng: parseCoord(editLng, editTarget.lng ?? 15.3125),
          isActive: editTarget.isActive !== false,
          ownerUserId: editTarget.ownerUserId || null,
        },
        editTarget.id,
      );
      setEditTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur mise à jour");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || readOnly) return;
    setSaving(true);
    try {
      await deleteRestaurant(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur suppression");
    } finally {
      setSaving(false);
    }
  }

  function openMenuEditor(r: Restaurant) {
    setMenuTarget(r);
    setMenuItems(parseMenuItems(r.menuItems));
  }

  function addMenuItem() {
    setMenuItems((items) => [...items, { name: "", priceCdf: 0, unitPriceCdf: 0, isAvailable: true }]);
  }

  function updateMenuItem(index: number, patch: Partial<MenuItem>) {
    setMenuItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeMenuItem(index: number) {
    setMenuItems((items) => items.filter((_, i) => i !== index));
  }

  async function saveMenu() {
    if (!menuTarget || readOnly) return;
    setSaving(true);
    setError(null);
    try {
      const normalized = menuItems
        .filter((item) => item.name.trim())
        .map((item) => ({
          name: item.name.trim(),
          priceCdf: item.priceCdf,
          unitPriceCdf: item.priceCdf,
          description: item.description?.trim() || undefined,
          isAvailable: item.isAvailable !== false,
        }));
      await saveRestaurant({ menuItems: normalized }, menuTarget.id);
      setMenuTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur menu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Restaurants"
        subtitle={readOnly ? "Consultation des restaurants partenaires" : "Créer, modifier et désactiver les restaurants"}
      />
      {readOnly && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          Accès lecture seule pour votre rôle.
        </p>
      )}
      {error && <ErrorBanner message={error} onRetry={load} />}

      {!readOnly && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <h2 className="font-semibold text-sm text-gray-700">Ajouter un restaurant</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Nom" />
            <TextInput value={form.cuisine} onChange={(v) => setForm((f) => ({ ...f, cuisine: v }))} placeholder="Cuisine" />
            <TextInput value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} placeholder="Adresse" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <FieldLabel>Latitude GPS</FieldLabel>
              <TextInput value={form.lat} onChange={(v) => setForm((f) => ({ ...f, lat: v }))} placeholder="-4.3217" />
            </label>
            <label className="text-sm">
              <FieldLabel>Longitude GPS</FieldLabel>
              <TextInput value={form.lng} onChange={(v) => setForm((f) => ({ ...f, lng: v }))} placeholder="15.3125" />
            </label>
          </div>
          <GpsCoordButton
            onCoords={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
            onError={setError}
          />
          <p className="text-xs text-gray-400">
            Position géographique du restaurant — visible par les passagers pour le tri par distance.
          </p>
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 space-y-2">
            <FieldLabel>Compte partenaire (portail restaurant)</FieldLabel>
            <SelectInput
              value={form.ownerUserId}
              onChange={(v) => setForm((f) => ({ ...f, ownerUserId: v }))}
              options={partnerOptions}
            />
            <p className="text-xs text-gray-500">
              Liez un utilisateur avec le rôle <strong>RESTAURANT</strong> pour qu&apos;il gère menu et commandes sur le portail.
              {" "}
              <Link href="/utilisateurs" className="text-[#6C63FF] underline">Créer un compte →</Link>
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-[#6C63FF] text-white text-sm font-medium disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Créer"}
          </button>
        </form>
      )}

      {loading ? (
        <LoadingState />
      ) : restaurants.length === 0 ? (
        <EmptyState message="Aucun restaurant" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Nom</th>
                <th className="p-3">Cuisine</th>
                <th className="p-3">Adresse</th>
                <th className="p-3">GPS</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Compte partenaire</th>
                <th className="p-3">Note</th>
                {!readOnly && <th className="p-3">Menu</th>}
                {!readOnly && <th className="p-3"></th>}
              </tr>
            </thead>
            <tbody>
              {restaurants.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3">{r.cuisine ?? "—"}</td>
                  <td className="p-3 text-gray-500">{r.address ?? "—"}</td>
                  <td className="p-3 text-gray-500 text-xs font-mono">
                    {r.lat != null && r.lng != null ? `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}` : "—"}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.isActive !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                      {r.isActive !== false ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td className="p-3 text-gray-600 text-xs max-w-[180px] truncate" title={partnerLabel(r.ownerUserId)}>
                    {partnerLabel(r.ownerUserId)}
                  </td>
                  <td className="p-3">{r.rating?.toFixed(1) ?? "—"}</td>
                  {!readOnly && (
                    <td className="p-3">
                      <BtnGhost onClick={() => openMenuEditor(r)}>
                        Menu ({parseMenuItems(r.menuItems).length})
                      </BtnGhost>
                    </td>
                  )}
                  {!readOnly && (
                    <td className="p-3 flex gap-2">
                      <BtnGhost
                        onClick={() => {
                          setEditTarget({ ...r });
                          setEditLat(r.lat != null ? String(r.lat) : "");
                          setEditLng(r.lng != null ? String(r.lng) : "");
                        }}
                      >
                        Modifier
                      </BtnGhost>
                      <BtnDanger onClick={() => setDeleteTarget(r)}>Supprimer</BtnDanger>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Modifier restaurant">
        {editTarget && (
          <div className="space-y-4">
            <label><FieldLabel>Nom</FieldLabel><TextInput value={editTarget.name} onChange={(v) => setEditTarget({ ...editTarget, name: v })} /></label>
            <label><FieldLabel>Cuisine</FieldLabel><TextInput value={editTarget.cuisine ?? ""} onChange={(v) => setEditTarget({ ...editTarget, cuisine: v })} /></label>
            <label><FieldLabel>Adresse</FieldLabel><TextInput value={editTarget.address ?? ""} onChange={(v) => setEditTarget({ ...editTarget, address: v })} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <FieldLabel>Latitude</FieldLabel>
                <TextInput value={editLat} inputMode="decimal" onChange={setEditLat} placeholder="-4.3217" />
              </label>
              <label>
                <FieldLabel>Longitude</FieldLabel>
                <TextInput value={editLng} inputMode="decimal" onChange={setEditLng} placeholder="15.3125" />
              </label>
            </div>
            <GpsCoordButton
              onCoords={(lat, lng) => {
                setEditLat(lat);
                setEditLng(lng);
              }}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editTarget.isActive !== false}
                onChange={(e) => setEditTarget({ ...editTarget, isActive: e.target.checked })}
                className="w-4 h-4"
              />
              Restaurant actif (visible côté passager)
            </label>
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 space-y-2">
              <FieldLabel>Lier au compte partenaire</FieldLabel>
              <SelectInput
                value={editTarget.ownerUserId ?? ""}
                onChange={(v) => setEditTarget({ ...editTarget, ownerUserId: v || null })}
                options={partnerOptions}
              />
              <p className="text-xs text-gray-500">
                Le compte choisi pourra se connecter au{" "}
                <a href={process.env.NEXT_PUBLIC_RESTAURANT_URL ?? "http://localhost:3007"} target="_blank" rel="noreferrer" className="text-[#6C63FF] underline">
                  portail restaurant
                </a>
                . Créez d&apos;abord un utilisateur rôle RESTAURANT dans{" "}
                <Link href="/utilisateurs" className="text-[#6C63FF] underline">Utilisateurs</Link>.
              </p>
            </div>
            <BtnPrimary onClick={handleUpdate} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</BtnPrimary>
          </div>
        )}
      </Modal>

      <Modal open={!!menuTarget} onClose={() => setMenuTarget(null)} title={`Menu — ${menuTarget?.name ?? ""}`} wide>
        {menuTarget && (
          <div className="space-y-4">
            {menuItems.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun plat. Ajoutez des articles au menu.</p>
            ) : (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {menuItems.map((item, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1fr_120px_auto] items-end border-b pb-3">
                    <label>
                      <FieldLabel>Nom du plat</FieldLabel>
                      <TextInput
                        value={item.name}
                        onChange={(v) => updateMenuItem(index, { name: v })}
                        placeholder="Ex. Poulet moambe"
                      />
                    </label>
                    <label>
                      <FieldLabel>Prix (FC)</FieldLabel>
                      <TextInput
                        value={String(item.priceCdf || "")}
                        onChange={(v) => {
                          const n = Number.parseInt(v, 10);
                          updateMenuItem(index, { priceCdf: Number.isFinite(n) ? n : 0, unitPriceCdf: Number.isFinite(n) ? n : 0 });
                        }}
                        type="number"
                      />
                    </label>
                    <BtnDanger onClick={() => removeMenuItem(index)}>Retirer</BtnDanger>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <BtnGhost onClick={addMenuItem}>+ Ajouter un plat</BtnGhost>
              <BtnPrimary onClick={saveMenu} disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer le menu"}
              </BtnPrimary>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer le restaurant"
        message={`Désactiver « ${deleteTarget?.name ?? ""} » ? Les commandes en cours ne seront pas affectées.`}
        confirmLabel="Supprimer"
        danger
        loading={saving}
      />
    </div>
  );
}
