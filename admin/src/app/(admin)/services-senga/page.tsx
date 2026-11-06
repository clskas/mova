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
  const canEditServices = canWrite("systeme") && role === "SUPER_ADMIN";
  const canEditSengaPlus =
    canWrite("systeme") && (role === "SUPER_ADMIN" || role === "ADMIN");
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
    if (!config || !canEditServices) return;
    setConfig({
      ...config,
      passengerServices: {
        ...config.passengerServices,
        [id]: !(config.passengerServices?.[id] !== false),
      },
    });
    setOk(null);
  }

  function toggleSengaPlus() {
    if (!config || !canEditSengaPlus) return;
    const current = config.features?.sengaPlusVisible !== false;
    setConfig({
      ...config,
      features: { ...config.features, sengaPlusVisible: !current },
    });
    setOk(null);
  }

  function togglePassengerCount() {
    if (!config || !canEditSengaPlus) return;
    setConfig({
      ...config,
      features: { ...config.features, passengerCountEnabled: config.features?.passengerCountEnabled !== true },
    });
    setOk(null);
  }

  function toggleFamiliale() {
    if (!config || !canEditSengaPlus) return;
    setConfig({
      ...config,
      features: { ...config.features, familialeEnabled: config.features?.familialeEnabled !== true },
    });
    setOk(null);
  }

  function toggleTricycle() {
    if (!config || !canEditSengaPlus) return;
    setConfig({
      ...config,
      features: { ...config.features, tricycleEnabled: config.features?.tricycleEnabled !== true },
    });
    setOk(null);
  }

  async function save() {
    if (!config || (!canEditServices && !canEditSengaPlus)) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const patch: Partial<ClientAppsConfig> = {};
      if (canEditServices) patch.passengerServices = config.passengerServices;
      if (canEditSengaPlus) {
        patch.features = {
          sengaPlusVisible: config.features?.sengaPlusVisible !== false,
          passengerCountEnabled: config.features?.passengerCountEnabled === true,
          familialeEnabled: config.features?.familialeEnabled === true,
          tricycleEnabled: config.features?.tricycleEnabled === true,
        };
      }
      const next = await updateClientAppsConfig(patch);
      setConfig(next);
      setOk("Configuration SENGA enregistrée.");
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
        <PageHeader title="Services SENGA" subtitle="Visibilité des tuiles passager et SENGA Plus." />
        {error && <ErrorBanner message={error} />}
      </div>
    );
  }

  const sengaPlusOn = config.features?.sengaPlusVisible !== false;
  const passengerCountOn = config.features?.passengerCountEnabled === true;
  const familialeOn = config.features?.familialeEnabled === true;
  const tricycleOn = config.features?.tricycleEnabled === true;

  return (
    <div className="p-4 space-y-6 max-w-xl">
      <PageHeader
        title="Services SENGA"
        subtitle="Tuiles passager (SuperAdmin) et bouton SENGA Plus (Admin / SuperAdmin)."
      />
      {error && <ErrorBanner message={error} />}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">SENGA Plus (abonnements)</h2>
        {!canEditSengaPlus && (
          <p className="text-sm text-amber-700">Lecture seule pour SENGA Plus.</p>
        )}
        <label className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
          <span className="text-sm font-medium text-slate-800">Afficher le bouton SENGA Plus</span>
          <input
            type="checkbox"
            checked={sengaPlusOn}
            disabled={!canEditSengaPlus || saving}
            onChange={toggleSengaPlus}
          />
        </label>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">Nombre de passagers (courses voiture)</h2>
        <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
          <span className="text-sm text-slate-800">
            <span className="font-medium block">Activer le choix du nombre de passagers</span>
            <span className="text-xs text-slate-500">
              Le passager indique combien de personnes voyagent ; seules les voitures avec assez de places
              reçoivent la course. Désactivé = chaque course compte pour 1 passager (coupure immédiate, sans mise à jour).
            </span>
          </span>
          <input
            type="checkbox"
            checked={passengerCountOn}
            disabled={!canEditSengaPlus || saving}
            onChange={togglePassengerCount}
          />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
          <span className="text-sm text-slate-800">
            <span className="font-medium block">Gamme Familiale (6–8 places)</span>
            <span className="text-xs text-slate-500">
              Affiche la gamme Familiale dans l&apos;app passager. Avec le nombre de passagers activé,
              Standard, Confort et VIP sont limités à 4 personnes et l&apos;app passe en Familiale dès 5.
              N&apos;activez qu&apos;une fois des véhicules Familiale validés (Chauffeurs → type d&apos;engin).
              Tarif : Tarifs → Familiale.
            </span>
          </span>
          <input
            type="checkbox"
            checked={familialeOn}
            disabled={!canEditSengaPlus || saving}
            onChange={toggleFamiliale}
          />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
          <span className="text-sm text-slate-800">
            <span className="font-medium block">Gamme Tricycle (tricycle à passagers, 1–3 places)</span>
            <span className="text-xs text-slate-500">
              Affiche la gamme Tricycle dans l&apos;app passager (3 passagers maximum). N&apos;activez qu&apos;une fois
              assez de tricycles validés dans la ville (Chauffeurs → type d&apos;engin). Tarif : Tarifs → Tricycle.
              Les tripoteurs (marchandises) reçoivent colis et petits déménagements sans cet interrupteur.
            </span>
          </span>
          <input
            type="checkbox"
            checked={tricycleOn}
            disabled={!canEditSengaPlus || saving}
            onChange={toggleTricycle}
          />
        </label>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">Tuiles accueil passager</h2>
        {!canEditServices && (
          <p className="text-sm text-amber-700">Lecture seule — seuls les SuperAdmin modifient les tuiles.</p>
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
                    disabled={!canEditServices || saving}
                    onChange={() => toggle(s.id)}
                  />
                  {on ? "Visible" : "Masqué"}
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {(canEditServices || canEditSengaPlus) && (
        <BtnPrimary onClick={() => void save()} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </BtnPrimary>
      )}
    </div>
  );
}
