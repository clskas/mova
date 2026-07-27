"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deletePublicite,
  fetchPublicites,
  savePublicite,
  uploadVehiclePhoto,
  type Publicite,
  type PubliciteCible,
} from "@/lib/api";
import { resolveMediaUrl } from "@/components/VehiclePhotoUpload";
import { useAdmin } from "@/components/AdminProvider";
import {
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
  StatusBadge,
  TextInput,
} from "@/components/ui";

const CIBLE_OPTIONS = [
  { value: "TOUS", label: "TOUS" },
  { value: "PASSENGER", label: "Passagers" },
  { value: "DRIVER", label: "Chauffeurs" },
  { value: "RESTAURANT", label: "Restaurants" },
  { value: "RENTAL_PARTNER", label: "Partenaires location" },
];

const ACTIF_OPTIONS = [
  { value: "true", label: "Oui" },
  { value: "false", label: "Non" },
];

function toDatetimeLocal(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function formatDisplayDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function defaultStartDate() {
  return toDatetimeLocal(new Date().toISOString());
}

export default function PublicitesPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("publicites");
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<Publicite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | Publicite | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Publicite | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [titre, setTitre] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [lien, setLien] = useState("");
  const [description, setDescription] = useState("");
  const [cible, setCible] = useState<PubliciteCible>("TOUS");
  const [actif, setActif] = useState("true");
  const [dateDebut, setDateDebut] = useState(defaultStartDate);
  const [dateFin, setDateFin] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublicites();
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setTitre("");
    setImageUrl("");
    setLien("");
    setDescription("");
    setCible("TOUS");
    setActif("true");
    setDateDebut(defaultStartDate());
    setDateFin("");
    setModal("create");
  }

  function openEdit(item: Publicite) {
    setTitre(item.titre);
    setImageUrl(item.imageUrl);
    setLien(item.lien ?? "");
    setDescription(item.description ?? "");
    setCible(item.cible);
    setActif(item.isActive ? "true" : "false");
    setDateDebut(toDatetimeLocal(item.dateDebut));
    setDateFin(toDatetimeLocal(item.dateFin));
    setModal(item);
  }

  async function handleUpload(file: File | null) {
    if (!file || readOnly) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadVehiclePhoto(file);
      setImageUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec envoi image");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!titre.trim() || !imageUrl.trim() || !dateDebut || readOnly) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        titre: titre.trim(),
        imageUrl: imageUrl.trim(),
        lien: lien.trim() || null,
        description: description.trim() || null,
        cible,
        isActive: actif === "true",
        dateDebut: fromDatetimeLocal(dateDebut),
        dateFin: dateFin ? fromDatetimeLocal(dateFin) : null,
      };
      if (modal === "create") {
        await savePublicite(payload);
      } else if (modal) {
        await savePublicite(payload, modal.id);
      }
      setModal(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deletePublicite(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec suppression");
    }
  }

  const preview = resolveMediaUrl(imageUrl);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <PageHeader
        title="Publicités"
        subtitle="Bannières et promotions affichées dans les applications passager et chauffeur"
        action={!readOnly ? <BtnPrimary onClick={openCreate}>Nouvelle publicité</BtnPrimary> : undefined}
      />
      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        <LoadingState />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Titre</th>
                <th className="p-3">Cible</th>
                <th className="p-3">Actif</th>
                <th className="p-3">Début</th>
                <th className="p-3">Fin</th>
                <th className="p-3">Aperçu</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState message="Aucune publicité — créez une bannière pour les apps mobile et web." />
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{item.titre}</td>
                    <td className="p-3">{item.cible}</td>
                    <td className="p-3">
                      <StatusBadge status={item.isActive ? "ACTIVE" : "SUSPENDED"} />
                    </td>
                    <td className="p-3 text-gray-600">{formatDisplayDate(item.dateDebut)}</td>
                    <td className="p-3 text-gray-600">{formatDisplayDate(item.dateFin)}</td>
                    <td className="p-3">
                      {resolveMediaUrl(item.imageUrl) ? (
                        <img
                          src={resolveMediaUrl(item.imageUrl)!}
                          alt={item.titre}
                          className="h-10 w-16 object-cover rounded border"
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2 flex-wrap">
                        {!readOnly && (
                          <>
                            <button type="button" onClick={() => openEdit(item)} className="text-sm text-[#6C63FF] hover:underline">
                              Modifier
                            </button>
                            <button type="button" onClick={() => setDeleteTarget(item)} className="text-sm text-red-500 hover:underline">
                              Supprimer
                            </button>
                          </>
                        )}
                        {item.lien && (
                          <a href={item.lien} target="_blank" rel="noreferrer" className="text-sm text-gray-500 hover:underline">
                            Lien
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === "create" ? "Nouvelle publicité" : "Modifier la publicité"}
        wide
      >
        <div className="space-y-4">
          <label>
            <FieldLabel>Titre *</FieldLabel>
            <TextInput value={titre} onChange={setTitre} placeholder="Promotion été Kinshasa" disabled={readOnly} />
          </label>

          <label>
            <FieldLabel>Image</FieldLabel>
            <div className="flex gap-2">
              <TextInput
                value={imageUrl}
                onChange={setImageUrl}
                placeholder="https://exemple.com/image.jpg"
                disabled={readOnly}
              />
              <button
                type="button"
                disabled={readOnly || uploading}
                onClick={() => fileRef.current?.click()}
                className="shrink-0 h-11 w-11 rounded-xl border-2 border-[#6C63FF] text-[#6C63FF] flex items-center justify-center hover:bg-violet-50 disabled:opacity-50"
                aria-label="Téléverser une image"
                title="Téléverser une image"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M4 7h3l2-2h6l2 2h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
              />
            </div>
            {preview && (
              <img src={preview} alt="Aperçu" className="mt-2 w-full max-h-40 object-cover rounded-xl border" />
            )}
          </label>

          <label>
            <FieldLabel>Lien (URL de redirection)</FieldLabel>
            <div className="flex gap-2">
              <TextInput
                value={lien}
                onChange={setLien}
                placeholder="https://exemple.com/promotion"
                disabled={readOnly}
              />
              {lien.trim() && (
                <a
                  href={lien.trim()}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 h-11 w-11 rounded-xl border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-50"
                  aria-label="Ouvrir le lien"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M14 3h7v7M10 14L21 3M21 14v7H3V3h7" />
                  </svg>
                </a>
              )}
            </div>
          </label>

          <label>
            <FieldLabel>Description</FieldLabel>
            <textarea
              className="w-full rounded-xl border border-gray-200 p-3 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={readOnly}
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label>
              <FieldLabel>Cible</FieldLabel>
              <SelectInput value={cible} onChange={(v) => setCible(v as PubliciteCible)} options={CIBLE_OPTIONS} disabled={readOnly} />
            </label>
            <label>
              <FieldLabel>Actif</FieldLabel>
              <SelectInput value={actif} onChange={setActif} options={ACTIF_OPTIONS} disabled={readOnly} />
            </label>
            <label>
              <FieldLabel>Date début</FieldLabel>
              <input
                type="datetime-local"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                disabled={readOnly}
              />
            </label>
            <label>
              <FieldLabel>Date fin (optionnelle)</FieldLabel>
              <input
                type="datetime-local"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                disabled={readOnly}
              />
            </label>
          </div>

          {!readOnly && (
            <div className="flex gap-3 pt-2">
              <BtnPrimary onClick={handleSave} disabled={saving || !titre.trim() || !imageUrl.trim() || !dateDebut}>
                {saving ? "Enregistrement…" : modal === "create" ? "Créer" : "Enregistrer"}
              </BtnPrimary>
              <BtnGhost onClick={() => setModal(null)}>Annuler</BtnGhost>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer la publicité"
        message={`Supprimer « ${deleteTarget?.titre ?? ""} » ?`}
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
}
