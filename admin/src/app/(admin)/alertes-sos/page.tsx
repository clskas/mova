"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchClientAppsConfig,
  fetchUsers,
  updateClientAppsConfig,
  type AdminUser,
  type ClientAppsConfig,
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

export default function SosAlertesPage() {
  const { role, canWrite } = useAdmin();
  const readOnly = !canWrite("systeme") || role !== "SUPER_ADMIN";
  const [config, setConfig] = useState<ClientAppsConfig | null>(null);
  const [staff, setStaff] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [audiences, setAudiences] = useState<Set<SosAudience>>(new Set());
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
    // Empty list = all ops (fallback). Clear selection to mean “everyone”.
    setSelected(new Set());
    setOk(null);
  }

  async function save() {
    if (readOnly) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const ids = Array.from(selected);
      const audienceList = Array.from(audiences);
      const next = await updateClientAppsConfig({
        sosAlertUserIds: ids,
        sosAlertAudiences: audienceList,
      });
      setConfig(next);
      setSelected(new Set(next.sosAlertUserIds ?? []));
      setAudiences(new Set((next.sosAlertAudiences ?? []) as SosAudience[]));
      const opsMsg =
        (next.sosAlertUserIds?.length ?? 0) === 0
          ? "tous les agents ops"
          : `${next.sosAlertUserIds!.length} agent(s) ops`;
      const audLabels = (next.sosAlertAudiences ?? [])
        .map((a) => AUDIENCE_OPTIONS.find((o) => o.id === a)?.label ?? a)
        .join(", ");
      setOk(
        audLabels
          ? `SOS → ${opsMsg} + ${audLabels}.`
          : `SOS → ${opsMsg} uniquement.`,
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
        subtitle="Choisir qui reçoit les notifications SOS (agents ops + audiences). Réservé SuperAdmin. Liste agents vide = tous les ops."
      />
      {error && <ErrorBanner message={error} />}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      {readOnly && (
        <p className="text-sm text-amber-700">Lecture seule — seuls les SuperAdmin peuvent modifier.</p>
      )}

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
