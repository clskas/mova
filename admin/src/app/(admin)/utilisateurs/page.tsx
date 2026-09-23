"use client";

import { useCallback, useEffect, useState } from "react";
import {
  activationPinSmsCopy,
  createUser,
  deactivateUser as deactivateUserApi,
  fetchCities,
  fetchDrivers,
  fetchUser,
  fetchUsers,
  formatUserName,
  purgePlayPrelaunchUsers,
  purgeUser as purgeUserApi,
  regeneratePartnerLoginPin,
  updateUser,
  type AdminCity,
  type AdminUser,
} from "@/lib/api";
import { userRoleDisplayLabel } from "@/lib/commerce-type";
import { useAdmin } from "@/components/AdminProvider";
import {
  ACCESS_LEVEL_OPTIONS,
  defaultAccessLevelIdsForRole,
  normalizeAdminRole,
} from "@/lib/rbac";
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
  StatusBadge,
  TextInput,
} from "@/components/ui";

const STAFF_EDIT_ROLES = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "SUPPORT",
  "FINANCE",
  "CONTENT",
  "CITY_ADMIN",
]);

export default function UtilisateursPage() {
  const { canWrite, role, user } = useAdmin();
  const readOnly = !canWrite("utilisateurs");
  const canPurge = role === "SUPER_ADMIN";
  const canFilterCities = role === "SUPER_ADMIN" || role === "ADMIN";
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [driverUserIds, setDriverUserIds] = useState<Set<string>>(new Set());
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
  const [editAccessLevels, setEditAccessLevels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<AdminUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPhone, setCreatePhone] = useState("");
  const [createRole, setCreateRole] = useState("RESTAURANT");
  const [createFirst, setCreateFirst] = useState("");
  const [createLast, setCreateLast] = useState("");
  const [loginPin, setLoginPin] = useState<string | null>(null);
  const [pinNotice, setPinNotice] = useState<string | null>(null);
  const [editManagedCity, setEditManagedCity] = useState("");
  const [createManagedCity, setCreateManagedCity] = useState("");
  const [cityOptions, setCityOptions] = useState<AdminCity[]>([]);

  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [searchQuery, setSearchQuery] = useState("");
  const [showPlayPrelaunch, setShowPlayPrelaunch] = useState(false);
  const [purgePlayOpen, setPurgePlayOpen] = useState(false);
  const [cityFilter, setCityFilter] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data, total: count }, drivers] = await Promise.all([
        fetchUsers(
          page * pageSize,
          pageSize,
          searchQuery.trim() || undefined,
          showPlayPrelaunch,
          canFilterCities && cityFilter.length > 0 ? cityFilter : undefined,
        ),
        fetchDrivers(true).catch(() => []),
      ]);
      setUsers(data);
      setTotal(count);
      setDriverUserIds(new Set(drivers.map((d) => d.userId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, showPlayPrelaunch, cityFilter, canFilterCities]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!canFilterCities && !canPurge) return;
    fetchCities()
      .then((cities) => setCityOptions(cities.filter((c) => c.isActive !== false)))
      .catch(() => setCityOptions([]));
  }, [canFilterCities, canPurge]);

  function toggleCityFilter(name: string) {
    setPage(0);
    setCityFilter((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
  }

  function applySearch() {
    setPage(0);
    setSearchQuery(search.trim());
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function openDetail(u: AdminUser) {
    setSelected(u);
    const nextRole = u.role ?? "PASSENGER";
    setEditRole(nextRole);
    setEditPhone(u.phone ?? "");
    setEditStatus(u.status ?? "ACTIVE");
    setEditFirst(u.firstName ?? "");
    setEditLast(u.lastName ?? "");
    setEditManagedCity(u.managedCity ?? "");
    const staffRole = normalizeAdminRole(nextRole);
    if (staffRole) {
      setEditAccessLevels(
        u.accessLevelIds?.length
          ? u.accessLevelIds
          : defaultAccessLevelIdsForRole(staffRole),
      );
    } else {
      setEditAccessLevels([]);
    }
    setLoginPin(null);
    setPinNotice(null);
    // Recharge le détail (liste enrichie + source de vérité après Enregistrer).
    try {
      const fresh = await fetchUser(u.id);
      if (!fresh) return;
      setSelected(fresh);
      setEditRole(fresh.role ?? nextRole);
      setEditPhone(fresh.phone ?? "");
      setEditStatus(fresh.status ?? "ACTIVE");
      setEditFirst(fresh.firstName ?? "");
      setEditLast(fresh.lastName ?? "");
      setEditManagedCity(fresh.managedCity ?? "");
      const fr = normalizeAdminRole(fresh.role ?? nextRole);
      if (fr) {
        setEditAccessLevels(
          fresh.accessLevelIds?.length
            ? fresh.accessLevelIds
            : defaultAccessLevelIdsForRole(fr),
        );
      }
    } catch {
      /* garde les données liste déjà affichées */
    }
  }

  function onEditRoleChange(next: string) {
    setEditRole(next);
    const staffRole = normalizeAdminRole(next);
    setEditAccessLevels(staffRole ? defaultAccessLevelIdsForRole(staffRole) : []);
  }

  function toggleAccessLevel(id: string) {
    setEditAccessLevels((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function saveNewUser() {
    if (!createPhone.trim()) {
      setError("Le téléphone est obligatoire.");
      return;
    }
    if (createRole === "CITY_ADMIN" && !createManagedCity.trim()) {
      setError("Choisissez la ville gérée pour un Admin ville.");
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
        ...(createRole === "CITY_ADMIN" ? { managedCity: createManagedCity.trim() } : {}),
      });
      setCreateOpen(false);
      setCreatePhone("");
      setCreateFirst("");
      setCreateLast("");
      setCreateRole("RESTAURANT");
      setCreateManagedCity("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la création");
    } finally {
      setSaving(false);
    }
  }

  async function saveUser() {
    if (!selected) return;
    if (editRole === "CITY_ADMIN" && !editManagedCity.trim()) {
      setError("Choisissez la ville gérée pour un Admin ville.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const staffRole = normalizeAdminRole(editRole);
      const payload: Partial<AdminUser> & { accessLevelIds?: string[] } = {
        role: editRole,
        phone: editPhone,
        status: editStatus,
        firstName: editFirst,
        lastName: editLast,
        managedCity: editRole === "CITY_ADMIN" ? editManagedCity.trim() : null,
      };
      if (canPurge && staffRole) {
        // Toujours envoyer la liste (même vide) pour forcer la persistance côté auth.
        payload.accessLevelIds = [...editAccessLevels];
      }
      await updateUser(selected.id, payload);
      setSelected(null);
      await load();
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

  async function resendPartnerPin() {
    if (!selected) return;
    const subject =
      selected.role === "RESTAURANT"
        ? "RESTAURANT"
        : selected.role === "RENTAL_PARTNER"
          ? "RENTAL_PARTNER"
          : null;
    if (!subject) return;
    setSaving(true);
    setError(null);
    try {
      const result = await regeneratePartnerLoginPin(subject, selected.id);
      setLoginPin(result.loginPin ?? null);
      setPinNotice(activationPinSmsCopy(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de générer le PIN");
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
            : `Comptes de connexion (login) — ${total} au total. Les dossiers KYC chauffeur sont dans Chauffeurs.`
        }
        action={
          !readOnly ? (
            <div className="flex flex-wrap gap-2">
              <BtnPrimary onClick={() => setCreateOpen(true)}>Nouveau compte</BtnPrimary>
              {canPurge && (
                <BtnGhost
                  onClick={() => {
                    setCreateRole("CITY_ADMIN");
                    setCreateManagedCity("");
                    setCreateOpen(true);
                  }}
                >
                  + Admin ville
                </BtnGhost>
              )}
            </div>
          ) : undefined
        }
      />
      <p className="text-sm text-gray-600 mb-4">
        <strong>Utilisateurs</strong> = qui peut se connecter (rôle Passager, Chauffeur, partenaire commerce
        — resto / boutique / pharmacie / supermarché —, Location, staff).
        <strong> Chauffeurs</strong> = profils véhicule / KYC. Un chauffeur réel a les deux : rôle Chauffeur ici, et une
        ligne dans Chauffeurs. Les partenaires restaurant / location apparaissent ici même sans +243 (connexion Google).
        Les robots Google Play / Test Lab restent masqués.
      </p>
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
        {canFilterCities && (
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-[#1A1A2E]">Filtrer par villes</p>
              {cityFilter.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-[#6C63FF]"
                  onClick={() => {
                    setPage(0);
                    setCityFilter([]);
                  }}
                >
                  Toutes les villes
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
              {(cityOptions.length > 0 ? cityOptions.map((c) => c.name) : []).map((name) => {
                const on = cityFilter.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleCityFilter(name)}
                    className={`text-xs rounded-full px-2.5 py-1 border ${
                      on
                        ? "bg-[#6C63FF] text-white border-[#6C63FF]"
                        : "bg-gray-50 text-gray-700 border-gray-200"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Affiche chauffeurs, partenaires et admins ville rattachés aux villes choisies.
            </p>
          </div>
        )}
        {!showPlayPrelaunch && (
          <p className="text-xs text-gray-500">
            Les comptes robots Google Play / Firebase Test Lab (sans téléphone) sont masqués — ce ne sont pas des clients SENGA.
          </p>
        )}
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
                      {driverUserIds.has(u.id) && u.role !== "DRIVER" && (
                        <span className="ml-2 text-[11px] font-medium text-violet-800 bg-violet-100 rounded-full px-2 py-0.5">
                          Profil chauffeur
                        </span>
                      )}
                    </td>
                    <td className="p-3">{u.phone ?? "—"}</td>
                    <td className="p-3">{u.email?.trim() ? u.email : "—"}</td>
                    <td className="p-3">
                      <StatusBadge
                        status={u.role === "RESTAURANT" ? (u.commerceType ?? "RESTAURANT") : u.role}
                        label={userRoleDisplayLabel(u.role, u.commerceType)}
                      />
                    </td>
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

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={createRole === "CITY_ADMIN" ? "Créer un admin ville" : "Créer un compte"}
      >
        <div className="space-y-4">
          {createRole === "CITY_ADMIN" ? (
            <p className="text-sm text-gray-600">
              L’admin ville ne voit que les données de sa ville (courses, livraisons, restos…).
              Il ne peut pas modifier les tarifs ni la trésorerie. Réservé au SUPER_ADMIN.
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              Créez un partenaire (Restaurant / Location) ou, en SUPER_ADMIN, un staff
              (Admin ville, Support…). Le partenaire peut aussi s’inscrire seul via OTP.
            </p>
          )}
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
                { value: "RESTAURANT", label: "Partenaire commerce" },
                { value: "RENTAL_PARTNER", label: "Partenaire location" },
                { value: "PASSENGER", label: "Passager" },
                { value: "DRIVER", label: "Chauffeur" },
                ...(canPurge
                  ? [
                      { value: "ADMIN", label: "Administrateur" },
                      { value: "SUPPORT", label: "Support" },
                      { value: "FINANCE", label: "Finance" },
                      { value: "CONTENT", label: "Contenu" },
                      { value: "CITY_ADMIN", label: "Admin ville" },
                      { value: "SUPER_ADMIN", label: "Super admin" },
                    ]
                  : []),
              ]}
            />
          </label>
          {canPurge && createRole === "CITY_ADMIN" && (
            <label>
              <FieldLabel>Ville gérée *</FieldLabel>
              <SelectInput
                value={createManagedCity}
                onChange={setCreateManagedCity}
                options={[
                  { value: "", label: "Choisir une ville…" },
                  ...cityOptions.map((c) => ({ value: c.name, label: c.name })),
                ]}
              />
            </label>
          )}
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

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={readOnly ? "Détail utilisateur" : "Modifier utilisateur"}
        wide
        footer={
          selected && !readOnly ? (
            <div className="flex flex-col gap-2">
              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <BtnPrimary onClick={saveUser} disabled={saving}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </BtnPrimary>
                {editStatus !== "SUSPENDED" && (
                  <BtnDanger onClick={() => setDeactivateTarget(selected)} disabled={saving}>
                    Désactiver
                  </BtnDanger>
                )}
                {canPurge && selected.id !== user?.id && (
                  <BtnDanger onClick={() => setPurgeTarget(selected)} disabled={saving}>
                    Supprimer cet utilisateur
                  </BtnDanger>
                )}
              </div>
            </div>
          ) : undefined
        }
      >
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
                {selected.role === "RESTAURANT" ? (
                  <div className="mt-1">
                    <StatusBadge
                      status={selected.commerceType ?? "RESTAURANT"}
                      label={userRoleDisplayLabel(selected.role, selected.commerceType)}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Type de commerce du partenaire (restaurant, boutique, pharmacie ou supermarché).
                      Modifiable dans la page Restaurants.
                    </p>
                  </div>
                ) : (
                  <SelectInput value={editRole} onChange={onEditRoleChange} disabled={readOnly} options={[
                    { value: "PASSENGER", label: "Passager" },
                    { value: "DRIVER", label: "Chauffeur" },
                    { value: "RESTAURANT", label: "Partenaire commerce (resto / boutique / …)" },
                    { value: "RENTAL_PARTNER", label: "Partenaire location" },
                    { value: "ADMIN", label: "Administrateur" },
                    { value: "SUPER_ADMIN", label: "Super admin" },
                    { value: "SUPPORT", label: "Support" },
                    { value: "FINANCE", label: "Finance" },
                    { value: "CONTENT", label: "Contenu" },
                    { value: "CITY_ADMIN", label: "Admin ville" },
                  ]} />
                )}
              </label>
              {canPurge && STAFF_EDIT_ROLES.has(editRole) && (
                <div className="sm:col-span-2 rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-2">
                  <p className="text-sm font-semibold text-violet-950">Niveaux d&apos;accès</p>
                  <p className="text-xs text-violet-900">
                    Par défaut : droits du rôle. Cochez / décochez pour personnaliser (le collaborateur devra se reconnecter).
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2 pt-1">
                    {ACCESS_LEVEL_OPTIONS.map((lvl) => (
                      <label key={lvl.id} className="flex items-start gap-2 text-sm text-violet-950">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={editAccessLevels.includes(lvl.id)}
                          disabled={readOnly}
                          onChange={() => toggleAccessLevel(lvl.id)}
                        />
                        <span>{lvl.label}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-xs text-[#6C63FF] hover:underline"
                    disabled={readOnly}
                    onClick={() => {
                      const r = normalizeAdminRole(editRole);
                      if (r) setEditAccessLevels(defaultAccessLevelIdsForRole(r));
                    }}
                  >
                    Réinitialiser aux défauts du rôle
                  </button>
                </div>
              )}
              {selected.role !== "RESTAURANT" && editRole === "RESTAURANT" && !readOnly && (
                <p className="text-xs text-amber-800 sm:col-span-2">
                  Après passage en partenaire commerce, le type (resto / boutique / pharmacie / supermarché)
                  se règle dans Restaurants.
                </p>
              )}
              {editRole === "CITY_ADMIN" && (
                <label>
                  <FieldLabel>Ville gérée *</FieldLabel>
                  <SelectInput
                    value={editManagedCity}
                    onChange={setEditManagedCity}
                    disabled={readOnly || !canPurge}
                    options={[
                      { value: "", label: "Choisir une ville…" },
                      ...cityOptions.map((c) => ({ value: c.name, label: c.name })),
                      ...(editManagedCity && !cityOptions.some((c) => c.name === editManagedCity)
                        ? [{ value: editManagedCity, label: editManagedCity }]
                        : []),
                    ]}
                  />
                </label>
              )}
              <label>
                <FieldLabel>Statut</FieldLabel>
                <SelectInput value={editStatus} onChange={setEditStatus} disabled={readOnly} options={[
                  { value: "ACTIVE", label: "Actif" },
                  { value: "SUSPENDED", label: "Suspendu" },
                  { value: "PENDING_KYC", label: "KYC en attente" },
                ]} />
              </label>
            </div>
            {(selected.role === "RESTAURANT" || selected.role === "RENTAL_PARTNER") && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm space-y-2">
                <p className="font-semibold text-amber-950">
                  {selected.pinConfigured
                    ? "PIN de connexion configuré"
                    : "KYC OK — PIN à transmettre"}
                </p>
                <p className="text-amber-900 text-xs">
                  Après validation KYC, un PIN à 6 chiffres est généré et envoyé par SMS / e-mail.
                  S&apos;il n&apos;arrive pas, un SUPER_ADMIN peut le renvoyer ici — le code s&apos;affiche une fois.
                </p>
                {loginPin && (
                  <p className="font-mono text-2xl tracking-widest text-amber-950">{loginPin}</p>
                )}
                {pinNotice && <p className="text-amber-800 text-xs">{pinNotice}</p>}
                {canPurge && (
                  <button
                    type="button"
                    onClick={resendPartnerPin}
                    disabled={saving}
                    className="text-sm text-[#6C63FF] hover:underline disabled:opacity-50"
                  >
                    {selected.pinConfigured ? "Renvoyer un nouveau PIN" : "Générer et afficher le PIN"}
                  </button>
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
