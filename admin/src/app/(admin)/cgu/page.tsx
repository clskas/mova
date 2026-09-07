"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteCgu,
  fetchCguVersions,
  publishCgu,
  saveCgu,
  unpublishCgu,
  type LegalDocument,
} from "@/lib/api";
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

const FORMAT_OPTIONS = [
  { value: "markdown", label: "Markdown" },
  { value: "html", label: "HTML" },
  { value: "plain", label: "Texte" },
];

const DEFAULT_BODY = `# Conditions Générales d'Utilisation — SENGA RDC

**Dernière mise à jour :** ${new Date().toLocaleDateString("fr-FR")}
**Éditeur :** SENGA SARL, Kinshasa, RDC

## 1. Objet

Les présentes Conditions Générales d'Utilisation régissent l'accès et l'utilisation de la plateforme SENGA.
`;

const emptyForm = {
  version: "1.0",
  title: "Conditions Générales d'Utilisation — SENGA RDC",
  body: DEFAULT_BODY,
  format: "markdown",
};

function formatPublishedAt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export default function CguPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("cgu");
  const [items, setItems] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | LegalDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LegalDocument | null>(null);
  const [publishTarget, setPublishTarget] = useState<LegalDocument | null>(null);
  const [unpublishTarget, setUnpublishTarget] = useState<LegalDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await fetchCguVersions());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger les CGU");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    const nextMinor = items.length ? `${items.length + 1}.0` : "1.0";
    setForm({ ...emptyForm, version: nextMinor });
    setModal("create");
  }

  function openEdit(item: LegalDocument) {
    setForm({
      version: item.version,
      title: item.title,
      body: item.body,
      format: item.format || "markdown",
    });
    setModal(item);
  }

  async function persist() {
    if (readOnly) return;
    if (!form.version.trim() || !form.title.trim() || !form.body.trim()) {
      setError("Indiquez une version, un titre et le texte des CGU.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = modal && modal !== "create" ? modal.id : undefined;
      await saveCgu(
        {
          version: form.version.trim(),
          title: form.title.trim(),
          body: form.body,
          format: form.format,
        },
        id,
      );
      setModal(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  async function confirmPublish() {
    if (!publishTarget) return;
    setError(null);
    try {
      await publishCgu(publishTarget.id);
      setPublishTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publication impossible");
    }
  }

  async function confirmUnpublish() {
    if (!unpublishTarget) return;
    setError(null);
    try {
      await unpublishCgu(unpublishTarget.id);
      setUnpublishTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retrait impossible");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteCgu(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible");
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Conditions générales d'utilisation"
        subtitle="Versions des CGU SENGA. La version publiée s'affiche aux chauffeurs (Lire les CGU) et dans l'aide."
        action={!readOnly ? <BtnPrimary onClick={openCreate}>Nouvelle version</BtnPrimary> : undefined}
      />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {readOnly && <p className="text-sm text-gray-500">Consultation uniquement pour votre rôle.</p>}

      {loading ? (
        <LoadingState />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Version</th>
                <th className="p-3">Titre</th>
                <th className="p-3">Format</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Publiée le</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState message="Aucune version — créez puis publiez la première CGU. Tant qu'aucune version n'est publiée, l'app affiche le texte par défaut." />
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono">{item.version}</td>
                    <td className="p-3">{item.title}</td>
                    <td className="p-3 text-gray-600">
                      {FORMAT_OPTIONS.find((o) => o.value === item.format)?.label ?? item.format}
                    </td>
                    <td className="p-3">
                      {item.isPublished ? (
                        <span className="text-emerald-700 font-medium">En vigueur</span>
                      ) : (
                        <span className="text-gray-500">Brouillon</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{formatPublishedAt(item.publishedAt)}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <BtnGhost onClick={() => openEdit(item)}>{readOnly ? "Voir" : "Modifier"}</BtnGhost>
                      {!readOnly && !item.isPublished && (
                        <BtnGhost onClick={() => setPublishTarget(item)}>Publier</BtnGhost>
                      )}
                      {!readOnly && item.isPublished && (
                        <BtnGhost onClick={() => setUnpublishTarget(item)}>Ne plus afficher</BtnGhost>
                      )}
                      {!readOnly && !item.isPublished && (
                        <BtnDanger onClick={() => setDeleteTarget(item)}>Supprimer</BtnDanger>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "create" ? "Nouvelle version CGU" : readOnly ? "CGU" : "Modifier la CGU"}
        wide
      >
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Version</FieldLabel>
              <TextInput
                value={form.version}
                onChange={(v) => setForm({ ...form, version: v })}
                placeholder="1.1"
                disabled={readOnly}
              />
            </div>
            <div>
              <FieldLabel>Format</FieldLabel>
              <SelectInput
                value={form.format}
                onChange={(v) => setForm({ ...form, format: v })}
                options={FORMAT_OPTIONS}
                disabled={readOnly}
              />
            </div>
          </div>
          <div>
            <FieldLabel>Titre</FieldLabel>
            <TextInput value={form.title} onChange={(v) => setForm({ ...form, title: v })} disabled={readOnly} />
          </div>
          <div>
            <FieldLabel>Texte (Markdown ou HTML)</FieldLabel>
            <textarea
              className="mt-1 w-full min-h-[280px] rounded-xl border p-3 font-mono text-sm disabled:bg-gray-50"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="flex justify-end gap-2">
            <BtnGhost onClick={() => setModal(null)}>{readOnly ? "Fermer" : "Annuler"}</BtnGhost>
            {!readOnly && (
              <BtnPrimary onClick={persist} disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </BtnPrimary>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!publishTarget}
        onClose={() => setPublishTarget(null)}
        onConfirm={confirmPublish}
        title="Publier cette version ?"
        message={`La version ${publishTarget?.version ?? ""} deviendra la CGU affichée dans l'application. L'ancienne version en vigueur ne sera plus visible.`}
        confirmLabel="Publier"
      />

      <ConfirmDialog
        open={!!unpublishTarget}
        onClose={() => setUnpublishTarget(null)}
        onConfirm={confirmUnpublish}
        title="Ne plus afficher cette version ?"
        message="L'application reviendra au texte par défaut tant qu'aucune autre version n'est publiée."
        confirmLabel="Ne plus afficher"
        danger
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer cette version ?"
        message={`La version ${deleteTarget?.version ?? ""} sera définitivement retirée.`}
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
}
