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

export default function SosAlertesPage() {
  const { role, canWrite } = useAdmin();
  const readOnly = !canWrite("systeme") || role !== "SUPER_ADMIN";
  const [config, setConfig] = useState<ClientAppsConfig | null>(null);
  const [staff, setStaff] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger la config SOS");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected = useMemo(
    () => staff.length > 0 && staff.every((u) => selected.has(u.id)),
    [staff, selected],
  );

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

  function selectAllOps() {
    if (readOnly) return;
    // Empty list = all ops (fallback). Clear selection to mean “everyone”.
    setSelected(new Set());
    setOk(null);
  }

  function selectEveryoneListed() {
    if (readOnly) return;
    setSelected(new Set(staff.map((u) => u.id)));
    setOk(null);
  }

  async function save() {
    if (readOnly) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const ids = Array.from(selected);
      const next = await updateClientAppsConfig({ sosAlertUserIds: ids });
      setConfig(next);
      setSelected(new Set(next.sosAlertUserIds ?? []));
      setOk(
        (next.sosAlertUserIds?.length ?? 0) === 0
          ? "Tous les agents ops (rôles admin) recevront les alertes SOS."
          : `${next.sosAlertUserIds!.length} agent(s) sélectionné(s) pour les SOS.`,
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
        subtitle="Choisir quels agents reçoivent les notifications SOS. Réservé SuperAdmin. Liste vide = tous les ops."
      />
      {error && <ErrorBanner message={error} />}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      {readOnly && (
        <p className="text-sm text-amber-700">Lecture seule — seuls les SuperAdmin peuvent modifier.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={readOnly || saving}
          onClick={selectAllOps}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          Tous les ops (défaut)
        </button>
        <button
          type="button"
          disabled={readOnly || saving}
          onClick={selectEveryoneListed}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          Cocher toute la liste
        </button>
        {(config?.sosAlertUserIds?.length ?? 0) === 0 && (
          <span className="text-xs text-slate-500 self-center">Mode actuel : tous les agents ops</span>
        )}
      </div>

      <ul className="space-y-2 rounded-lg border border-slate-200 divide-y divide-slate-100">
        {staff.map((u) => {
          const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.phone || u.email || u.id;
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

      {!readOnly && (
        <BtnPrimary onClick={() => void save()} disabled={saving}>
          {saving ? "Enregistrement…" : allSelected && selected.size > 0 ? "Enregistrer la sélection" : "Enregistrer"}
        </BtnPrimary>
      )}
    </div>
  );
}
