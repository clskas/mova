"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createUser,
  deactivateUser as deactivateUserApi,
  fetchUsers,
  formatUserName,
  purgePlayPrelaunchUsers,
  purgeUser as purgeUserApi,
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
  const { canWrite, role, user } = useAdmin();
  const readOnly = !canWrite("utilisateurs");
  const canPurge = role === "SUPER_ADMIN";
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
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
  const [purgeTarget, setPurgeTarget] = useState<AdminUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPhone, setCreatePhone] = useState("");
  const [createRole, setCreateRole] = useState("RESTAURANT");
  const [createFirst, setCreateFirst] = useState("");
  const [createLast, setCreateLast] = useState("");

  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [searchQuery, setSearchQuery] = useState("");
  const [showPlayPrelaunch, setShowPlayPrelaunch] = useState(false);
  const [purgePlayOpen, setPurgePlayOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, total: count } = await fetchUsers(
        page * pageSize,
        pageSize,
        searchQuery.trim() || undefined,
        showPlayPrelaunch,
      );
      setUsers(data);
      setTotal(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, showPlayPrelaunch]);

  useEffect(() => { load(); }, [load]);

  function applySearch() {
    setPage(0);
    setSearchQuery(search.trim());
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function openDetail(u: AdminUser) {
    setSelected(u);
    setEditRole(u.role ?? "PASSENGER");
    setEditPhone(u.phone ?? "");
    setEditStatus(u.status ?? "ACTIVE");
    setEditFirst(u.firstName ?? "");
    setEditLast(u.lastName ?? "");
  }

  async function saveNewUser() {
    if (!createPhone.trim()) {
      setError("Le téléphone est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createUser({
        phone: createPhone.trim(),
        role: createRole,
        firstName: createFirst.trim() || undefined,
        lastName: createLast.trim() || undefined,
      });
      setCreateOpen(false);
      setCreatePhone("");
      setCreateFirst("");
      setCreateLast("");
      setCreateRole("RESTAURANT");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la création");
    } finally {
      setSaving(false);
    }
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
      await deactivateUserApi(deactivateTarget.id);
      setDeactivateTarget(null);
      setSelected(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la désactivation");
    } finally {
      setSaving(false);
    }
  }

  async function purgePlayBots() {
    setSaving(true);
    setError(null);
    try {
      const result = await purgePlayPrelaunchUsers();
      setPurgePlayOpen(false);
      setShowPlayPrelaunch(false);
      load();
      if (result.skipped.length > 0) {
        setError(`${result.deleted} compte(s) Test Lab supprimé(s), ${result.skipped.length} ignoré(s).`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de nettoyer les comptes Test Lab.");
    } finally {
      setSaving(false);
    }
  }

  async function purgeUser() {
    if (!purgeTarget) return;
    setSaving(true);
    setError(null);
    try {
      await purgeUserApi(purgeTarget.id);
      setPurgeTarget(null);
      setSelected(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de supprimer cet utilisateur.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Utilisateurs"
        subtitle={
          readOnly
            ? `Consultation des comptes (${total} au total)`
            : `Gestion des comptes passagers, chauffeurs, partenaires et admins — ${total} au total`
        }
        action={
          !readOnly ? (
            <BtnPrimary onClick={() => setCreateOpen(true)}>Créer un partenaire</BtnPrimary>
          ) : undefined
        }
      />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-end">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher par nom, téléphone, e-mail ou rôle…" />
          <BtnPrimary onClick={applySearch}>Rechercher</BtnPrimary>
          <label className="flex items-center gap-2 text-sm text-gray-600 pb-1">
            <input
              type="checkbox"
              checked={showPlayPrelaunch}
              onChange={(e) => {
                setPage(0);
                setShowPlayPrelaunch(e.target.checked);
              }}
            />
            Afficher les comptes Google Play / Test Lab
          </label>
          {canPurge && showPlayPrelaunch && (
            <BtnDanger onClick={() => setPurgePlayOpen(true)} disabled={saving}>
              Nettoyer les comptes Test Lab
            </BtnDanger>
          )}
        </div>
        {showPlayPrelaunch && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Ces lignes viennent du rapport pré-lancement Google Play / Firebase Test Lab
            (e-mails <code className="text-xs">prenomsnom.12345@gmail.com</code> et{" "}
            <code className="text-xs">@cloudtestlabaccounts.com</code>, sans téléphone).
            Ce n’est pas le seed démo <code className="text-xs">+2439000000xx</code>.
            Ils sont masqués par défaut. Vous pouvez les ignorer ou les supprimer après revue.
          </p>
        )}
        {loading ? (
          <LoadingState />
        ) : users.length === 0 ? (
          <EmptyState message="Aucun utilisateur trouvé" />
        ) : (
          <>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="p-3">Nom</th>
                  <th className="p-3">Téléphone</th>
                  <th className="p-3">E-mail</th>
                  <th className="p-3">Rôle</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">
                      {formatUserName(u)}
                      {u.playPrelaunch && (
                        <span className="ml-2 text-[11px] font-medium text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">
                          Test Lab
                        </span>
                      )}
                    </td>
                    <td className="p-3">{u.phone ?? "—"}</td>
                    <td className="p-3">{u.email?.trim() ? u.email : "—"}</td>
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
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Page {page + 1} / {totalPages} · {total} utilisateur(s)</span>
            <div className="flex gap-2">
              <BtnPrimary onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                Précédent
              </BtnPrimary>
              <BtnPrimary onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                Suivant
              </BtnPrimary>
            </div>
          </div>
          </>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Créer un partenaire">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Le portail restaurant / location crée le compte à la première connexion OTP. Vous pouvez aussi
            créer ou lier un partenaire ici (rôle Restaurant ou Partenaire location), puis relier le
            restaurant (menu Restaurants) ou les véhicules (Catalogue location).
          </p>
          <label>
            <FieldLabel>Téléphone *</FieldLabel>
            <TextInput value={createPhone} onChange={setCreatePhone} placeholder="+243900000030" />
          </label>
          <label>
            <FieldLabel>Rôle *</FieldLabel>
            <SelectInput
              value={createRole}
              onChange={setCreateRole}
              options={[
                { value: "RESTAURANT", label: "Restaurant partenaire" },
                { value: "RENTAL_PARTNER", label: "Partenaire location" },
                { value: "PASSENGER", label: "Passager" },
                { value: "DRIVER", label: "Chauffeur" },
              ]}
            />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label>
              <FieldLabel>Prénom</FieldLabel>
              <TextInput value={createFirst} onChange={setCreateFirst} />
            </label>
            <label>
              <FieldLabel>Nom</FieldLabel>
              <TextInput value={createLast} onChange={setCreateLast} />
            </label>
          </div>
          <BtnPrimary onClick={saveNewUser} disabled={saving}>
            {saving ? "Création…" : "Créer le compte"}
          </BtnPrimary>
        </div>
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={readOnly ? "Détail utilisateur" : "Modifier utilisateur"} wide>
        {selected && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400">ID: {selected.id}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <label><FieldLabel>Prénom</FieldLabel><TextInput value={editFirst} onChange={setEditFirst} disabled={readOnly} /></label>
              <label><FieldLabel>Nom</FieldLabel><TextInput value={editLast} onChange={setEditLast} disabled={readOnly} /></label>
              <label><FieldLabel>Téléphone</FieldLabel><TextInput value={editPhone} onChange={setEditPhone} disabled={readOnly} /></label>
              <label>
                <FieldLabel>E-mail</FieldLabel>
                <TextInput value={selected.email?.trim() ? selected.email : "—"} onChange={() => undefined} disabled />
              </label>
              <label>
                <FieldLabel>Rôle</FieldLabel>
                <SelectInput value={editRole} onChange={setEditRole} disabled={readOnly} options={[
                  { value: "PASSENGER", label: "Passager" },
                  { value: "DRIVER", label: "Chauffeur" },
                  { value: "RESTAURANT", label: "Restaurant partenaire" },
                  { value: "RENTAL_PARTNER", label: "Partenaire location" },
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
                {canPurge && selected.id !== user?.id && (
                  <BtnDanger onClick={() => setPurgeTarget(selected)} disabled={saving}>Supprimer cet utilisateur</BtnDanger>
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
      <ConfirmDialog
        open={purgePlayOpen}
        onClose={() => setPurgePlayOpen(false)}
        onConfirm={purgePlayBots}
        title="Supprimer les comptes Google Play / Test Lab"
        message="Uniquement les comptes sans téléphone dont l'e-mail est @cloudtestlabaccounts.com ou prenom.nom.12345@gmail.com. Les vrais utilisateurs avec un numéro +243 ne sont pas touchés. Action irréversible."
        confirmLabel="Supprimer les comptes Test Lab"
        danger
        loading={saving}
        requireMatch={["TEST LAB"]}
        typedLabel="Saisissez TEST LAB pour confirmer"
      />
      <ConfirmDialog
        open={!!purgeTarget}
        onClose={() => setPurgeTarget(null)}
        onConfirm={purgeUser}
        title="Supprimer cet utilisateur"
        message={`Action irréversible. Le compte disparaît de la base auth (connexion impossible, JWT révoqué). Le profil chauffeur est effacé. Les courses historiques restent pour l’audit ; le solde portefeuille est gelé, pas versé automatiquement. La personne pourra se réinscrire avec le même numéro. Pour confirmer, saisissez le téléphone ou le nom de ${purgeTarget ? formatUserName(purgeTarget) : ""}.`}
        confirmLabel="Supprimer définitivement"
        danger
        loading={saving}
        requireMatch={
          purgeTarget
            ? [purgeTarget.phone, formatUserName(purgeTarget)].filter((v): v is string => Boolean(v && v.trim()))
            : []
        }
        typedLabel="Téléphone ou nom exact"
      />
    </div>
  );
}
