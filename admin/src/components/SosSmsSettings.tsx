"use client";

import { useState } from "react";
import { updateClientAppsConfig, type ClientAppsConfig, type SosSmsConfig } from "@/lib/api";

const DEFAULTS: SosSmsConfig = {
  toStaffForSos: true,
  toStaffForIncidents: false,
  toTrustedContacts: true,
  escalationSms: true,
  sosSmsNumber: "",
  notificationSms: false,
};

const SWITCHES: Array<{ key: keyof Omit<SosSmsConfig, "sosSmsNumber" | "notificationSms">; label: string; hint: string }> = [
  {
    key: "toStaffForSos",
    label: "SMS à l’équipe pour chaque SOS",
    hint: "Un SMS par agent destinataire. Coupé : l’équipe est prévenue seulement par notification et dans l’admin.",
  },
  {
    key: "escalationSms",
    label: "SMS de relance si un SOS n’est pas pris en charge en 2 minutes",
    hint: "Une seule relance par SOS.",
  },
  {
    key: "toTrustedContacts",
    label: "SMS aux contacts d’urgence de l’utilisateur",
    hint: "Jusqu’à 3 proches choisis par l’utilisateur dans son profil.",
  },
  {
    key: "toStaffForIncidents",
    label: "SMS à l’équipe pour les incidents non urgents",
    hint: "Accident, harcèlement, objet oublié… Coupé par défaut pour limiter le coût.",
  },
];

/** Super admin: which SOS / incident alerts also go by SMS (each SMS costs money). */
export function SosSmsSettings({
  config,
  readOnly,
  onSaved,
}: {
  config: ClientAppsConfig;
  readOnly: boolean;
  onSaved: (next: ClientAppsConfig) => void;
}) {
  const [value, setValue] = useState<SosSmsConfig>({ ...DEFAULTS, ...(config.sosSms ?? {}) });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const next = await updateClientAppsConfig({ sosSms: value });
      setValue({ ...DEFAULTS, ...(next.sosSms ?? {}) });
      onSaved(next);
      setMessage("Réglages SMS enregistrés.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 space-y-3" data-testid="sos-sms-settings">
      <div>
        <p className="text-sm font-medium text-slate-800">SMS payants</p>
        <p className="text-xs text-slate-500 mt-1">
          Chaque SMS est payant. Les notifications dans l’app et l’admin restent toujours envoyées. Les codes
          d’accès (inscription, connexion, PIN oublié, PIN d’activation) partent toujours par SMS.
        </p>
      </div>
      <label className="flex items-start gap-3 text-sm rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
        <input
          type="checkbox"
          className="mt-1"
          data-testid="notification-sms-switch"
          checked={value.notificationSms === true}
          disabled={readOnly || saving}
          onChange={(e) => setValue((v) => ({ ...v, notificationSms: e.target.checked }))}
        />
        <span>
          <span className="font-medium text-slate-800">SMS de notification</span>
          <span className="block text-xs text-slate-600">
            Nouvelle course pour un chauffeur dont l’app est fermée, rappels de paiement et de dettes en espèces,
            alertes restaurants / loueurs, refus KYC, code de réception d’un colis… Coupé : ces messages passent
            seulement par l’application (aucun coût SMS). Prend effet en 1 minute environ.
          </span>
        </span>
      </label>
      <p className="text-xs font-medium text-slate-700 pt-1">Alertes SOS et incidents</p>
      {SWITCHES.map((s) => (
        <label key={s.key} className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={value[s.key]}
            disabled={readOnly || saving}
            onChange={(e) => setValue((v) => ({ ...v, [s.key]: e.target.checked }))}
          />
          <span>
            <span className="font-medium text-slate-800">{s.label}</span>
            <span className="block text-xs text-slate-500">{s.hint}</span>
          </span>
        </label>
      ))}
      <label className="block text-sm">
        <span className="font-medium text-slate-800">Numéro pour les SOS envoyés par SMS (sans Internet)</span>
        <span className="block text-xs text-slate-500 mb-1">
          Quand l’alerte ne peut pas partir par Internet, l’app propose d’envoyer un SMS à ce numéro (téléphone de
          permanence). Vide : l’app propose seulement d’appeler les secours.
        </span>
        <input
          className="w-full max-w-xs rounded-lg border px-2 py-1"
          placeholder="+243 8XX XXX XXX"
          value={value.sosSmsNumber}
          disabled={readOnly || saving}
          onChange={(e) => setValue((v) => ({ ...v, sosSmsNumber: e.target.value }))}
        />
      </label>
      {!readOnly && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="text-sm px-3 py-1.5 rounded-lg bg-[#6C63FF] text-white disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer les réglages SMS"}
        </button>
      )}
      {message && <p className="text-xs text-slate-600">{message}</p>}
    </div>
  );
}
