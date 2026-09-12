"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchClientAppsConfig,
  updateClientAppsConfig,
  type ClientAppsConfig,
  type ClientAppId,
  type MmOperatorId,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { BtnPrimary, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

const APPS: { id: ClientAppId; label: string }[] = [
  { id: "senga", label: "Senga (passager)" },
  { id: "senga_driver", label: "Senga Driver" },
  { id: "resto", label: "Resto" },
  { id: "location", label: "Location véhicule" },
];

const OPERATORS: { id: MmOperatorId; label: string }[] = [
  { id: "AIRTEL_MONEY", label: "Airtel Money" },
  { id: "MPESA", label: "M-Pesa" },
  { id: "ORANGE_MONEY", label: "Orange Money" },
];

export default function OperateursMmPage() {
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

  function toggle(app: ClientAppId, op: MmOperatorId) {
    if (!config || readOnly) return;
    setConfig({
      ...config,
      mobileMoney: {
        ...config.mobileMoney,
        [app]: {
          ...config.mobileMoney[app],
          [op]: !config.mobileMoney[app][op],
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
      const next = await updateClientAppsConfig({ mobileMoney: config.mobileMoney });
      setConfig(next);
      setOk("Visibilité des opérateurs enregistrée.");
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
        <PageHeader title="Opérateurs Mobile Money" subtitle="Réservé aux SuperAdmin." />
        {error && <ErrorBanner message={error} />}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-4xl">
      <PageHeader
        title="Opérateurs Mobile Money"
        subtitle="Afficher ou masquer Airtel Money, M-Pesa et Orange Money par application. Orange Money est masqué par défaut jusqu’à correction SerdiPay."
      />
      {error && <ErrorBanner message={error} />}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      {readOnly && (
        <p className="text-sm text-amber-700">Lecture seule — seuls les SuperAdmin peuvent modifier.</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Application</th>
              {OPERATORS.map((op) => (
                <th key={op.id} className="p-3 font-medium">
                  {op.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {APPS.map((app) => (
              <tr key={app.id} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-800">{app.label}</td>
                {OPERATORS.map((op) => (
                  <td key={op.id} className="p-3">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.mobileMoney[app.id][op.id]}
                        disabled={readOnly || saving}
                        onChange={() => toggle(app.id, op.id)}
                      />
                      <span className="text-slate-600">
                        {config.mobileMoney[app.id][op.id] ? "Visible" : "Masqué"}
                      </span>
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <BtnPrimary disabled={saving} onClick={() => void save()}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </BtnPrimary>
      )}
    </div>
  );
}
