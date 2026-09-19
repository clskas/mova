"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchClientAppsConfig,
  updateClientAppsConfig,
  type ClientAppsConfig,
  type PassengerServiceId,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { BtnPrimary, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

const SERVICES: { id: PassengerServiceId; label: string }[] = [
  { id: "taxi", label: "Taxi / Moto-taxi" },
  { id: "parcel", label: "Colis" },
  { id: "food", label: "Repas" },
  { id: "express", label: "Express" },
  { id: "errand", label: "Courses & commissions" },
  { id: "scheduled", label: "Course planifiée" },
  { id: "carpool", label: "Covoiturage" },
  { id: "rental", label: "Location" },
  { id: "moving", label: "Déménagement" },
  { id: "wallet", label: "Portefeuille" },
];

export default function ServicesSengaPage() {
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

  function toggle(id: PassengerServiceId) {
    if (!config || readOnly) return;
    setConfig({
      ...config,
      passengerServices: {
        ...config.passengerServices,
        [id]: !(config.passengerServices?.[id] !== false),
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
      const next = await updateClientAppsConfig({ passengerServices: config.passengerServices });
      setConfig(next);
      setOk("Visibilité des services SENGA enregistrée.");
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
        <PageHeader title="Services SENGA" subtitle="Réservé aux SuperAdmin." />
        {error && <ErrorBanner message={error} />}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-xl">
      <PageHeader
        title="Services SENGA"
        subtitle="Afficher ou masquer les tuiles de l’application passager. Réservé SuperAdmin."
      />
      {error && <ErrorBanner message={error} />}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      {readOnly && (
        <p className="text-sm text-amber-700">Lecture seule — seuls les SuperAdmin peuvent modifier.</p>
      )}

      <ul className="space-y-2 rounded-lg border border-slate-200 divide-y divide-slate-100">
        {SERVICES.map((s) => {
          const on = config.passengerServices?.[s.id] !== false;
          return (
            <li key={s.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-slate-800">{s.label}</span>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={readOnly || saving}
                  onChange={() => toggle(s.id)}
                />
                {on ? "Visible" : "Masqué"}
              </label>
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <BtnPrimary disabled={saving} onClick={() => void save()}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </BtnPrimary>
      )}
    </div>
  );
}
