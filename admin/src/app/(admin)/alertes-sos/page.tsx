"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchClientAppsConfig,
  fetchUsers,
  updateClientAppsConfig,
  type AdminUser,
  type ClientAppsConfig,
  type SosEmergencyContact,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { BtnPrimary, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

const OPS_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "SUPPORT", "CITY_ADMIN"]);

type SosAudience = "PASSENGER" | "DRIVER" | "PARTNER";

const AUDIENCE_OPTIONS: { id: SosAudience; label: string }[] = [
  { id: "PASSENGER", label: "Passagers" },
  { id: "DRIVER", label: "Chauffeurs" },
  { id: "PARTNER", label: "Partenaires" },
];

function newContactId() {
  return `sos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function SosAlertesPage() {
  const { role, canWrite } = useAdmin();
  const readOnly = !canWrite("systeme") || role !== "SUPER_ADMIN";
  const [config, setConfig] = useState<ClientAppsConfig | null>(null);
  const [staff, setStaff] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [audiences, setAudiences] = useState<Set<SosAudience>>(new Set());
  const [contacts, setContacts] = useState<SosEmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cfg, usersRes] = await Promise.all([
        fetchClientAppsConfig(),
        fetchUsers(0, 200),
      ]);
      setConfig(cfg);
      const ops = (usersRes.data ?? []).filter((u) => OPS_ROLES.has(String(u.role ?? "").toUpperCase()));
      setStaff(ops);
      setSelected(new Set(cfg.sosAlertUserIds ?? []));
      setAudiences(new Set((cfg.sosAlertAudiences ?? []) as SosAudience[]));
      setContacts(
        [...(cfg.sosEmergencyContacts ?? [])].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "fr"),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger la config SOS");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allOpsSelected = useMemo(
    () => staff.length > 0 && staff.every((u) => selected.has(u.id)),
    [staff, selected],
  );

  const allAudiencesSelected = useMemo(
    () => AUDIENCE_OPTIONS.every((o) => audiences.has(o.id)),
    [audiences],
  );

  /** « Tous » = 3 audiences + toute la liste agents (ou liste vide = tous les ops). */
  const allChecked = useMemo(() => {
    const opsAll = selected.size === 0 || allOpsSelected;
    return allAudiencesSelected && opsAll && staff.length > 0;
  }, [allAudiencesSelected, allOpsSelected, selected.size, staff.length]);

  function toggle(id: string) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setOk(null);
  }

  function toggleAudience(id: SosAudience) {
    if (readOnly) return;
    setAudiences((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setOk(null);
  }

  function toggleTous() {
    if (readOnly) return;
    if (allChecked) {
      setAudiences(new Set());
      setSelected(new Set());
    } else {
      setAudiences(new Set(AUDIENCE_OPTIONS.map((o) => o.id)));
      setSelected(new Set(staff.map((u) => u.id)));
    }
    setOk(null);
  }

  function selectAllOpsDefault() {
    if (readOnly) return;
    setSelected(new Set());
    setOk(null);
  }

  function updateContact(id: string, patch: Partial<SosEmergencyContact>) {
    if (readOnly) return;
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setOk(null);
  }

  function addContact() {
    if (readOnly || contacts.length >= 20) return;
    setContacts((prev) => [
      ...prev,
      {
        id: newContactId(),
        label: "",
        phone: "",
        sortOrder: prev.length,
        enabled: true,
      },
    ]);
    setOk(null);
  }

  function removeContact(id: string) {
    if (readOnly) return;
    setContacts((prev) => prev.filter((c) => c.id !== id).map((c, i) => ({ ...c, sortOrder: i })));
    setOk(null);
  }

  function moveContact(id: string, dir: -1 | 1) {
    if (readOnly) return;
    setContacts((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((c, i) => ({ ...c, sortOrder: i }));
    });
    setOk(null);
  }

  async function save() {
    if (readOnly) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const cleaned = contacts
        .map((c, i) => ({
          ...c,
          label: c.label.trim(),
          phone: c.phone.trim(),
          sortOrder: i,
        }))
        .filter((c) => c.label && c.phone);
      if (cleaned.length === 0) {
        setError("Ajoutez au moins un numéro d’urgence (libellé + téléphone).");
        setSaving(false);
        return;
      }
      const ids = Array.from(selected);
      const audienceList = Array.from(audiences);
      const next = await updateClientAppsConfig({
        sosAlertUserIds: ids,
        sosAlertAudiences: audienceList,
        sosEmergencyContacts: cleaned,
      });
      setConfig(next);
      setSelected(new Set(next.sosAlertUserIds ?? []));
      setAudiences(new Set((next.sosAlertAudiences ?? []) as SosAudience[]));
      setContacts(
        [...(next.sosEmergencyContacts ?? [])].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "fr"),
        ),
      );
      const opsMsg =
        (next.sosAlertUserIds?.length ?? 0) === 0
          ? "tous les agents ops"
          : `${next.sosAlertUserIds!.length} agent(s) ops`;
      const audLabels = (next.sosAlertAudiences ?? [])
        .map((a) => AUDIENCE_OPTIONS.find((o) => o.id === a)?.label ?? a)
        .join(", ");
      const nContacts = next.sosEmergencyContacts?.length ?? 0;
      setOk(
        audLabels
          ? `SOS → ${opsMsg} + ${audLabels}. ${nContacts} numéro(s) d’urgence.`
          : `SOS → ${opsMsg}. ${nContacts} numéro(s) d’urgence.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="p-4 space-y-6 max-w-2xl">
      <PageHeader
        title="Alertes SOS"
        subtitle="Destinataires SOS + numéros d’urgence (police, pompiers…). Réservé SuperAdmin."
      />
      {error && <ErrorBanner message={error} />}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      {readOnly && (
        <p className="text-sm text-amber-700">Lecture seule — seuls les SuperAdmin peuvent modifier.</p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Numéros d’urgence</p>
            <p className="text-xs text-slate-500 mt-1">
              Affichés sur l’écran Alerte SOS des apps (appel téléphonique). Ex. Police Kinshasa, Pompiers, 112.
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              disabled={saving || contacts.length >= 20}
              onClick={addContact}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 shrink-0"
            >
              Ajouter
            </button>
          )}
        </div>
        <ul className="space-y-3">
          {contacts.map((c, idx) => (
            <li key={c.id} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={c.label}
                  disabled={readOnly || saving}
                  placeholder="Libellé (ex. Police Kinshasa)"
                  onChange={(e) => updateContact(c.id, { label: e.target.value })}
                  className="flex-1 min-w-[10rem] rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="tel"
                  value={c.phone}
                  disabled={readOnly || saving}
                  placeholder="Téléphone (ex. +243… ou 112)"
                  onChange={(e) => updateContact(c.id, { phone: e.target.value })}
                  className="w-44 rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    disabled={readOnly || saving}
                    onChange={(e) => updateContact(c.id, { enabled: e.target.checked })}
                  />
                  Actif dans l’app
                </label>
                {!readOnly && (
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      disabled={saving || idx === 0}
                      onClick={() => moveContact(c.id, -1)}
                      className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40"
                      title="Monter"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={saving || idx === contacts.length - 1}
                      onClick={() => moveContact(c.id, 1)}
                      className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40"
                      title="Descendre"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => removeContact(c.id)}
                      className="px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50"
                    >
                      Supprimer
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
          {contacts.length === 0 && (
            <li className="text-sm text-slate-500 text-center py-4">Aucun numéro — ajoutez Police / Pompiers / 112.</li>
          )}
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 space-y-3">
        <p className="text-sm font-medium text-slate-800">Audiences</p>
        <p className="text-xs text-slate-500">
          En plus des agents ops : push / notification in-app (pas de SMS de masse).
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={allChecked}
              disabled={readOnly || saving || staff.length === 0}
              onChange={toggleTous}
            />
            Tous
          </label>
          {AUDIENCE_OPTIONS.map((o) => (
            <label
              key={o.id}
              className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={audiences.has(o.id)}
                disabled={readOnly || saving}
                onChange={() => toggleAudience(o.id)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={readOnly || saving}
          onClick={selectAllOpsDefault}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          Tous les ops (défaut)
        </button>
        {(config?.sosAlertUserIds?.length ?? 0) === 0 && (
          <span className="text-xs text-slate-500 self-center">Mode agents : tous les ops</span>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-slate-800 mb-2">Agents ops</p>
        <ul className="space-y-2 rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
          {staff.map((u) => {
            const name =
              [u.firstName, u.lastName].filter(Boolean).join(" ") || u.phone || u.email || u.id;
            const checked = selected.has(u.id);
            return (
              <li key={u.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{name}</p>
                  <p className="text-xs text-slate-500">
                    {u.role}
                    {u.phone ? ` · ${u.phone}` : ""}
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-600 shrink-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={readOnly || saving}
                    onChange={() => toggle(u.id)}
                  />
                  {checked ? "Reçoit SOS" : "—"}
                </label>
              </li>
            );
          })}
          {staff.length === 0 && (
            <li className="px-4 py-6 text-sm text-slate-500 text-center">Aucun agent ops trouvé.</li>
          )}
        </ul>
      </div>

      {!readOnly && (
        <BtnPrimary onClick={() => void save()} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </BtnPrimary>
      )}
    </div>
  );
}
