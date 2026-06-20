"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  deleteRentalVehicle,
  fetchRentalVehicles,
  saveRentalVehicle,
  type RentalCatalogVehicle,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { VehiclePhotoUpload, resolveMediaUrl } from "@/components/VehiclePhotoUpload";
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

const CATEGORIES = [
  { value: "ECONOMY", label: "Économique" },
  { value: "SUV", label: "SUV" },
  { value: "PREMIUM", label: "Premium" },
  { value: "VAN", label: "Utilitaire" },
];

const TRANSMISSIONS = [
  { value: "MANUAL", label: "Manuelle" },
  { value: "AUTO", label: "Automatique" },
];

const EMPTY_FORM = {
  name: "",
  make: "",
  model: "",
  year: "",
  category: "ECONOMY",
  transmission: "MANUAL",
  city: "Kinshasa",
  seats: "5",
  dailyRateCdf: "",
  depositCdf: "100000",
  ownerName: "",
  ownerContactPhone: "",
  ownerBadge: "PRO",
  features: "",
  imageUrl: null as string | null,
};

function formatCdf(n?: number) {
  if (n == null) return "—";
  return `${n.toLocaleString("fr-CD")} FC`;
}

export default function CatalogueLocationPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("locations");
  const [vehicles, setVehicles] = useState<RentalCatalogVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editTarget, setEditTarget] = useState<RentalCatalogVehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RentalCatalogVehicle | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVehicles(await fetchRentalVehicles());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function buildPayload(source: typeof form | RentalCatalogVehicle) {
    const features =
      "features" in source && Array.isArray(source.features)
        ? source.features
        : String((source as typeof form).features ?? "")
            .split(",")
            .map((f) => f.trim())
            .filter(Boolean);
    return {
      name: source.name?.trim(),
      make: (source as RentalCatalogVehicle).make ?? (source as typeof form).make?.trim() || undefined,
      model: (source as RentalCatalogVehicle).model ?? (source as typeof form).model?.trim() || undefined,
      year: (source as typeof form).year
        ? Number((source as typeof form).year)
        : (source as RentalCatalogVehicle).year,
      category: source.category ?? "ECONOMY",
      transmission: (source as RentalCatalogVehicle).transmission ?? (source as typeof form).transmission ?? "MANUAL",
      city: (source as RentalCatalogVehicle).city ?? (source as typeof form).city ?? "Kinshasa",
      seats: Number((source as typeof form).seats ?? (source as RentalCatalogVehicle).seats ?? 5),
      dailyRateCdf: Number(
        (source as typeof form).dailyRateCdf || (source as RentalCatalogVehicle).dailyRateCdf || 0,
      ),
      depositCdf: Number(
        (source as typeof form).depositCdf || (source as RentalCatalogVehicle).depositCdf || 50000,
      ),
      ownerName:
        (source as RentalCatalogVehicle).ownerName ?? (source as typeof form).ownerName?.trim() || undefined,
      ownerContactPhone:
        (source as RentalCatalogVehicle).ownerContactPhone ??
        (source as typeof form).ownerContactPhone?.trim() ||
        undefined,
      ownerBadge:
        (source as RentalCatalogVehicle).ownerBadge ?? (source as typeof form).ownerBadge?.trim() || undefined,
      features,
      imageUrl: (source as RentalCatalogVehicle).imageUrl ?? (source as typeof form).imageUrl ?? undefined,
      isActive: (source as RentalCatalogVehicle).isActive !== false,
    };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.dailyRateCdf || readOnly) return;
    setSaving(true);
    setError(null);
    try {
      await saveRentalVehicle(buildPayload(form));
      setForm(EMPTY_FORM);
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
      await saveRentalVehicle(buildPayload(editTarget), editTarget.id);
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
      await deleteRentalVehicle(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur suppression");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalogue location"
        subtitle={
          readOnly
            ? "Consultation des véhicules proposés aux passagers"
            : "Créer et gérer les véhicules visibles dans l'app passager (onglet Location)"
        }
      />
      <p className="text-sm text-gray-600">
        Les <Link href="/locations" className="text-[#6C63FF] underline">demandes de location</Link> sont gérées
        séparément. Ici vous alimentez le catalogue affiché côté passager.
      </p>
      {error && <ErrorBanner message={error} onRetry={load} />}

      {!readOnly && (
        <Card>
          <h2 className="font-semibold text-[#1A1A2E] mb-4">Ajouter un véhicule</h2>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <FieldLabel>Nom affiché *</FieldLabel>
              <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Toyota Corolla" />
            </label>
            <label>
              <FieldLabel>Marque</FieldLabel>
              <TextInput value={form.make} onChange={(v) => setForm({ ...form, make: v })} />
            </label>
            <label>
              <FieldLabel>Modèle</FieldLabel>
              <TextInput value={form.model} onChange={(v) => setForm({ ...form, model: v })} />
            </label>
            <label>
              <FieldLabel>Catégorie</FieldLabel>
              <SelectInput value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORIES} />
            </label>
            <label>
              <FieldLabel>Transmission</FieldLabel>
              <SelectInput
                value={form.transmission}
                onChange={(v) => setForm({ ...form, transmission: v })}
                options={TRANSMISSIONS}
              />
            </label>
            <label>
              <FieldLabel>Ville</FieldLabel>
              <TextInput value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            </label>
            <label>
              <FieldLabel>Places</FieldLabel>
              <TextInput value={form.seats} onChange={(v) => setForm({ ...form, seats: v })} />
            </label>
            <label>
              <FieldLabel>Tarif / jour (FC) *</FieldLabel>
              <TextInput value={form.dailyRateCdf} onChange={(v) => setForm({ ...form, dailyRateCdf: v })} />
            </label>
            <label>
              <FieldLabel>Caution (FC)</FieldLabel>
              <TextInput value={form.depositCdf} onChange={(v) => setForm({ ...form, depositCdf: v })} />
            </label>
            <label>
              <FieldLabel>Propriétaire</FieldLabel>
              <TextInput value={form.ownerName} onChange={(v) => setForm({ ...form, ownerName: v })} />
            </label>
            <label>
              <FieldLabel>Tél. propriétaire</FieldLabel>
              <TextInput value={form.ownerContactPhone} onChange={(v) => setForm({ ...form, ownerContactPhone: v })} />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Équipements (séparés par des virgules)</FieldLabel>
              <TextInput
                value={form.features}
                onChange={(v) => setForm({ ...form, features: v })}
                placeholder="Climatisation, GPS, Diesel"
              />
            </label>
            <div className="sm:col-span-2">
              <VehiclePhotoUpload
                value={form.imageUrl}
                onChange={(url) => setForm({ ...form, imageUrl: url })}
                onError={setError}
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#6C63FF] text-white text-sm font-medium disabled:opacity-60"
              >
                {saving ? "Enregistrement…" : "Ajouter au catalogue"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <LoadingState />
      ) : vehicles.length === 0 ? (
        <EmptyState message="Aucun véhicule dans le catalogue" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Photo</th>
                <th className="p-3">Véhicule</th>
                <th className="p-3">Catégorie</th>
                <th className="p-3">Ville</th>
                <th className="p-3">Tarif/j</th>
                <th className="p-3">Propriétaire</th>
                <th className="p-3">Statut</th>
                {!readOnly && <th className="p-3" />}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const thumb = resolveMediaUrl(v.imageUrl);
                return (
                  <tr key={v.id} className="border-b">
                    <td className="p-3">
                      {thumb ? (
                        <img src={thumb} alt="" className="w-14 h-10 object-cover rounded-lg border" />
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 font-medium">
                      {v.name}
                      {v.make || v.model ? (
                        <span className="block text-xs text-gray-500 font-normal">
                          {[v.make, v.model].filter(Boolean).join(" ")}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3">{v.categoryLabel ?? v.category}</td>
                    <td className="p-3">{v.city ?? "—"}</td>
                    <td className="p-3">{formatCdf(v.dailyRateCdf)}</td>
                    <td className="p-3 text-xs text-gray-600">{v.ownerName ?? "—"}</td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          v.isActive !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {v.isActive !== false ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    {!readOnly && (
                      <td className="p-3 flex gap-2">
                        <BtnGhost onClick={() => setEditTarget({ ...v })}>Modifier</BtnGhost>
                        <BtnDanger onClick={() => setDeleteTarget(v)}>Désactiver</BtnDanger>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Modifier véhicule">
        {editTarget && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <label>
              <FieldLabel>Nom</FieldLabel>
              <TextInput value={editTarget.name} onChange={(v) => setEditTarget({ ...editTarget, name: v })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <FieldLabel>Marque</FieldLabel>
                <TextInput value={editTarget.make ?? ""} onChange={(v) => setEditTarget({ ...editTarget, make: v })} />
              </label>
              <label>
                <FieldLabel>Modèle</FieldLabel>
                <TextInput value={editTarget.model ?? ""} onChange={(v) => setEditTarget({ ...editTarget, model: v })} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <FieldLabel>Catégorie</FieldLabel>
                <SelectInput
                  value={editTarget.category}
                  onChange={(v) => setEditTarget({ ...editTarget, category: v })}
                  options={CATEGORIES}
                />
              </label>
              <label>
                <FieldLabel>Tarif / jour (FC)</FieldLabel>
                <TextInput
                  value={String(editTarget.dailyRateCdf ?? "")}
                  onChange={(v) => setEditTarget({ ...editTarget, dailyRateCdf: Number(v) || 0 })}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <FieldLabel>Propriétaire</FieldLabel>
                <TextInput
                  value={editTarget.ownerName ?? ""}
                  onChange={(v) => setEditTarget({ ...editTarget, ownerName: v })}
                />
              </label>
              <label>
                <FieldLabel>Tél. propriétaire</FieldLabel>
                <TextInput
                  value={editTarget.ownerContactPhone ?? ""}
                  onChange={(v) => setEditTarget({ ...editTarget, ownerContactPhone: v })}
                />
              </label>
            </div>
            <label>
              <FieldLabel>Équipements (virgules)</FieldLabel>
              <TextInput
                value={(editTarget.features ?? []).join(", ")}
                onChange={(v) =>
                  setEditTarget({
                    ...editTarget,
                    features: v.split(",").map((f) => f.trim()).filter(Boolean),
                  })
                }
              />
            </label>
            <VehiclePhotoUpload
              value={editTarget.imageUrl}
              onChange={(url) => setEditTarget({ ...editTarget, imageUrl: url })}
              onError={setError}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editTarget.isActive !== false}
                onChange={(e) => setEditTarget({ ...editTarget, isActive: e.target.checked })}
                className="w-4 h-4"
              />
              Visible dans le catalogue passager
            </label>
            <BtnPrimary onClick={handleUpdate} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </BtnPrimary>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Désactiver le véhicule"
        message={`Retirer « ${deleteTarget?.name ?? ""} » du catalogue passager ?`}
        confirmLabel="Désactiver"
        danger
        loading={saving}
      />
    </div>
  );
}
