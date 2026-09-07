"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteCompanyContact,
  fetchCompanyContacts,
  saveCompanyContact,
  type CompanyContact,
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
  SearchInput,
  SelectInput,
  TextInput,
} from "@/components/ui";

const DEPARTMENTS = [
  { value: "Support", label: "Support" },
  { value: "Exploitation", label: "Exploitation" },
  { value: "Juridique", label: "Juridique" },
  { value: "Direction", label: "Direction" },
  { value: "Finance", label: "Finance" },
  { value: "Communication", label: "Communication" },
  { value: "Autre", label: "Autre" },
];

const emptyForm = {
  name: "",
  title: "",
  department: "Support",
  phone: "",
  email: "",
  notes: "",
  isPublic: false,
};

export default function ContactsPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("contacts");
  const [items, setItems] = useState<CompanyContact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | CompanyContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyContact | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchCompanyContacts());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) =>
      [c.name, c.title, c.department, c.phone, c.email, c.notes]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, search]);

  function openCreate() {
    setForm(emptyForm);
    setModal("create");
  }

  function openEdit(item: CompanyContact) {
    setForm({
      name: item.name,
      title: item.title ?? "",
      department: item.department && DEPARTMENTS.some((d) => d.value === item.department) ? item.department : "Autre",
      phone: item.phone ?? "",
      email: item.email ?? "",
      notes: item.notes ?? "",
      isPublic: item.isPublic,
    });
    setModal(item);
  }

  async function handleSave() {
    if (readOnly) return;
    if (!form.name.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    if (!form.phone.trim() && !form.email.trim()) {
      setError("Indiquez un téléphone +243 ou un e-mail.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        department: form.department.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
        isPublic: form.isPublic,
      };
      if (modal === "create") {
        await saveCompanyContact(payload);
      } else if (modal) {
        await saveCompanyContact(payload, modal.id);
      }
      setModal(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteCompanyContact(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la suppression");
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Contacts de l'entreprise"
        subtitle="Personnes à joindre chez AfriSoft / SENGA : support, exploitation, juridique…"
        action={!readOnly ? <BtnPrimary onClick={openCreate}>Nouveau contact</BtnPrimary> : undefined}
      />
      {error && <ErrorBanner message={error} onRetry={load} />}

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Rechercher un nom, un service, un téléphone…"
      />

      {loading ? (
        <LoadingState />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Nom</th>
                <th className="p-3">Fonction</th>
                <th className="p-3">Service</th>
                <th className="p-3">Téléphone</th>
                <th className="p-3">E-mail</th>
                <th className="p-3">Visible</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState message="Aucun contact — ajoutez le support, l'exploitation ou le service juridique." />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{item.name}</td>
                    <td className="p-3 text-gray-600">{item.title || "—"}</td>
                    <td className="p-3 text-gray-600">{item.department || "—"}</td>
                    <td className="p-3 font-mono text-xs">{item.phone || "—"}</td>
                    <td className="p-3">{item.email || "—"}</td>
                    <td className="p-3">{item.isPublic ? "Oui" : "Non"}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {!readOnly && (
                        <>
                          <BtnGhost onClick={() => openEdit(item)}>Modifier</BtnGhost>
                          <BtnDanger onClick={() => setDeleteTarget(item)}>Supprimer</BtnDanger>
                        </>
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
        title={modal === "create" ? "Nouveau contact" : "Modifier le contact"}
      >
        <div className="space-y-4">
          <div>
            <FieldLabel>Nom</FieldLabel>
            <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Marie Kabila" />
          </div>
          <div>
            <FieldLabel>Fonction</FieldLabel>
            <TextInput
              value={form.title}
              onChange={(v) => setForm({ ...form, title: v })}
              placeholder="Responsable support"
            />
          </div>
          <div>
            <FieldLabel>Service</FieldLabel>
            <SelectInput
              value={form.department}
              onChange={(v) => setForm({ ...form, department: v })}
              options={DEPARTMENTS}
            />
          </div>
          <div>
            <FieldLabel>Téléphone (+243)</FieldLabel>
            <TextInput
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              placeholder="+243 81 000 0000"
              inputMode="tel"
            />
          </div>
          <div>
            <FieldLabel>E-mail</FieldLabel>
            <TextInput
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              placeholder="support@senga.cd"
              type="email"
            />
          </div>
          <div>
            <FieldLabel>Notes</FieldLabel>
            <TextInput
              value={form.notes}
              onChange={(v) => setForm({ ...form, notes: v })}
              placeholder="Horaires, langue, astreinte…"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isPublic}
              onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
            />
            {"Visible sur le site (page d'aide)"}
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <BtnGhost onClick={() => setModal(null)}>Annuler</BtnGhost>
            <BtnPrimary onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </BtnPrimary>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer ce contact ?"
        message={deleteTarget ? `${deleteTarget.name} sera retiré de la liste. Cette action est définitive.` : ""}
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
}
