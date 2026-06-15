"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  formatUserName,
  updateUser,
  type AdminUser,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnDanger,
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
  StatusBadge,
  TextInput,
} from "@/components/ui";

export default function UtilisateursPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("utilisateurs");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [editRole, setEditRole] = useState("PASSENGER");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AdminUser[]>("/api/admin/users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        formatUserName(u).toLowerCase().includes(q) ||
        u.phone?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q) ||
        u.status?.toLowerCase().includes(q)
    );
  }, [users, search]);

  function openDetail(u: AdminUser) {
    setSelected(u);
    setEditRole(u.role ?? "PASSENGER");
    setEditPhone(u.phone ?? "");
    setEditStatus(u.status ?? "ACTIVE");
    setEditFirst(u.firstName ?? "");
    setEditLast(u.lastName ?? "");
  }

  async function saveUser() {
    if (!selected) return;
    setSaving(true);
    try {
      await updateUser(selected.id, {
        role: editRole,
        phone: editPhone,
        status: editStatus,
        firstName: editFirst,
        lastName: editLast,
      });
      setSelected(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la mise à jour");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateUser() {
    if (!deactivateTarget) return;
    setSaving(true);
    try {
      await updateUser(deactivateTarget.id, { status: "SUSPENDED" });
      setDeactivateTarget(null);
      setSelected(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la désactivation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Utilisateurs" subtitle={readOnly ? "Consultation des comptes (lecture seule)" : "Gestion des comptes passagers, chauffeurs et admins"} />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      <div className="space-y-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher par nom, téléphone ou rôle…" />
        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState message="Aucun utilisateur trouvé" />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="p-3">Nom</th>
                  <th className="p-3">Téléphone</th>
                  <th className="p-3">Rôle</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{formatUserName(u)}</td>
                    <td className="p-3">{u.phone ?? "—"}</td>
                    <td className="p-3"><StatusBadge status={u.role} /></td>
                    <td className="p-3"><StatusBadge status={u.status ?? "ACTIVE"} /></td>
                    <td className="p-3">
                      <button type="button" onClick={() => openDetail(u)} className="text-[#6C63FF] text-sm hover:underline">
                        {readOnly ? "Voir" : "Voir / Modifier"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={readOnly ? "Détail utilisateur" : "Modifier utilisateur"} wide>
        {selected && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400">ID: {selected.id}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <label><FieldLabel>Prénom</FieldLabel><TextInput value={editFirst} onChange={setEditFirst} disabled={readOnly} /></label>
              <label><FieldLabel>Nom</FieldLabel><TextInput value={editLast} onChange={setEditLast} disabled={readOnly} /></label>
              <label><FieldLabel>Téléphone</FieldLabel><TextInput value={editPhone} onChange={setEditPhone} disabled={readOnly} /></label>
              <label>
                <FieldLabel>Rôle</FieldLabel>
                <SelectInput value={editRole} onChange={setEditRole} disabled={readOnly} options={[
                  { value: "PASSENGER", label: "Passager" },
                  { value: "DRIVER", label: "Chauffeur" },
                  { value: "ADMIN", label: "Administrateur" },
                  { value: "SUPER_ADMIN", label: "Super admin" },
                  { value: "SUPPORT", label: "Support" },
                  { value: "FINANCE", label: "Finance" },
                  { value: "CONTENT", label: "Contenu" },
                ]} />
              </label>
              <label>
                <FieldLabel>Statut</FieldLabel>
                <SelectInput value={editStatus} onChange={setEditStatus} disabled={readOnly} options={[
                  { value: "ACTIVE", label: "Actif" },
                  { value: "SUSPENDED", label: "Suspendu" },
                  { value: "PENDING_KYC", label: "KYC en attente" },
                ]} />
              </label>
            </div>
            {!readOnly && (
              <div className="flex flex-wrap gap-2 pt-2">
                <BtnPrimary onClick={saveUser} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</BtnPrimary>
                {editStatus !== "SUSPENDED" && (
                  <BtnDanger onClick={() => setDeactivateTarget(selected)} disabled={saving}>Désactiver</BtnDanger>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={deactivateUser}
        title="Désactiver l'utilisateur"
        message={`Confirmer la suspension de ${deactivateTarget ? formatUserName(deactivateTarget) : ""} ?`}
        confirmLabel="Désactiver"
        danger
        loading={saving}
      />
    </div>
  );
}
