"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchClientAppsConfig,
  updateClientAppsConfig,
  type ClientAppsConfig,
  type ClientAppId,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { BtnPrimary, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

const APPS: { id: ClientAppId; label: string }[] = [
  { id: "senga", label: "Senga (passager)" },
  { id: "senga_driver", label: "Senga Driver" },
  { id: "resto", label: "Resto" },
  { id: "location", label: "Location véhicule" },
];

const DEFAULT_MSG =
  "SENGA est actuellement en maintenance afin d’améliorer nos services et vous offrir une expérience encore meilleure. Merci pour votre patience et votre confiance — nous serons de retour très bientôt !";

export default function MaintenancePage() {
  const { role, canWrite } = useAdmin();
  const readOnly = !canWrite("systeme") || role !== "SUPER_ADMIN";
  const [config, setConfig] = useState<ClientAppsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setConfig(await fetchClientAppsConfig());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger la config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleApp(app: ClientAppId) {
    if (!config || readOnly) return;
    setConfig({
      ...config,
      maintenance: {
        ...config.maintenance,
        apps: {
          ...config.maintenance.apps,
          [app]: !config.maintenance.apps[app],
        },
      },
    });
    setOk(null);
  }

  async function save() {
    if (!config || readOnly) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const next = await updateClientAppsConfig({
        maintenance: {
          messageFr: config.maintenance.messageFr.trim() || DEFAULT_MSG,
          apps: config.maintenance.apps,
        },
      });
      setConfig(next);
      setOk("Mode maintenance enregistré.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (!config) {
    return (
      <div className="p-4 space-y-4">
        <PageHeader title="Mode maintenance" subtitle="Réservé aux SuperAdmin." />
        {error && <ErrorBanner message={error} />}
      </div>
    );
  }

  const anyActive = Object.values(config.maintenance.apps).some(Boolean);

  return (
    <div className="p-4 space-y-6 max-w-2xl">
      <PageHeader
        title="Mode maintenance"
        subtitle="Réservé aux SuperAdmin. Quand le mode est actif pour une app, le public voit une page de maintenance et l’API mobile répond 503 (sauf /api/public/app-version, /api/public/client-config et /health)."
      />
      {error && <ErrorBanner message={error} />}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      {readOnly && (
        <p className="text-sm text-amber-700">Lecture seule — seuls les SuperAdmin peuvent modifier.</p>
      )}

      {anyActive && (
        <p className="text-sm rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
          Maintenance active sur au moins une application.
        </p>
      )}

      <fieldset className="space-y-3">
        <legend className="font-medium text-slate-800 mb-1">Applications concernées</legend>
        {APPS.map((app) => (
          <label key={app.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.maintenance.apps[app.id]}
              disabled={readOnly || saving}
              onChange={() => toggleApp(app.id)}
            />
            {app.label}
          </label>
        ))}
      </fieldset>

      <div>
        <label className="block text-sm font-medium text-slate-800 mb-1" htmlFor="maint-msg">
          Message affiché (FR)
        </label>
        <textarea
          id="maint-msg"
          className="w-full min-h-[120px] rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={config.maintenance.messageFr}
          disabled={readOnly || saving}
          onChange={(e) =>
            setConfig({
              ...config,
              maintenance: { ...config.maintenance, messageFr: e.target.value },
            })
          }
        />
      </div>

      {!readOnly && (
        <BtnPrimary disabled={saving} onClick={() => void save()}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </BtnPrimary>
      )}
    </div>
  );
}
