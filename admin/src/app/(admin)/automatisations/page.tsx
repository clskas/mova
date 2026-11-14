"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPlatformConfig, updatePlatformConfig } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { BtnPrimary, Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

type Automations = {
  dailyReport: { enabled: boolean; hourKinshasa: number };
  anomalyAlerts: { enabled: boolean; minRequestsPerHour: number; cancelRatePct: number; unservedPerHour: number };
  docExpiry: { enabled: boolean; daysBefore: number[] };
  cashDebt: { enabled: boolean; remindAfterHours: number; blockAfterDays: number };
  driverBonus: { enabled: boolean; minJobs: number; bonusCdf: number; minJobs2: number; bonus2Cdf: number };
  demandHeatmap: { enabled: boolean; windowMinutes: number };
  referral: { enabled: boolean; referrerRewardCdf: number; refereeRewardCdf: number; maxPerReferrer: number; codeEntryDays: number };
};

const DEFAULTS: Automations = {
  dailyReport: { enabled: true, hourKinshasa: 7 },
  anomalyAlerts: { enabled: true, minRequestsPerHour: 10, cancelRatePct: 60, unservedPerHour: 5 },
  docExpiry: { enabled: true, daysBefore: [30, 7, 1] },
  cashDebt: { enabled: true, remindAfterHours: 24, blockAfterDays: 0 },
  driverBonus: { enabled: false, minJobs: 10, bonusCdf: 5000, minJobs2: 20, bonus2Cdf: 12000 },
  demandHeatmap: { enabled: true, windowMinutes: 30 },
  referral: { enabled: false, referrerRewardCdf: 2000, refereeRewardCdf: 2000, maxPerReferrer: 20, codeEntryDays: 7 },
};

function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Num({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <label className="text-sm text-slate-700">
      {label}
      <input
        type="number"
        className="mt-1 block w-28 rounded border border-slate-300 px-2 py-1"
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** Automations with their switches (super admin). */
export default function AutomatisationsPage() {
  const { role } = useAdmin();
  const editable = role === "SUPER_ADMIN";
  const [a, setA] = useState<Automations | null>(null);
  const [daysText, setDaysText] = useState("30, 7, 1");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchPlatformConfig();
      const cfg = (res.config as unknown as { automations?: Partial<Automations> }).automations ?? {};
      const next: Automations = {
        dailyReport: { ...DEFAULTS.dailyReport, ...cfg.dailyReport },
        anomalyAlerts: { ...DEFAULTS.anomalyAlerts, ...cfg.anomalyAlerts },
        docExpiry: { ...DEFAULTS.docExpiry, ...cfg.docExpiry },
        cashDebt: { ...DEFAULTS.cashDebt, ...cfg.cashDebt },
        driverBonus: { ...DEFAULTS.driverBonus, ...cfg.driverBonus },
        demandHeatmap: { ...DEFAULTS.demandHeatmap, ...cfg.demandHeatmap },
        referral: { ...DEFAULTS.referral, ...cfg.referral },
      };
      setA(next);
      setDaysText(next.docExpiry.daysBefore.join(", "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save<K extends keyof Automations>(key: K, value: Automations[K]) {
    setSaving(key);
    setError(null);
    setOk(null);
    try {
      await updatePlatformConfig({ automations: { [key]: value } });
      await load();
      setOk("Enregistré.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(null);
    }
  }

  if (!a) return error ? <ErrorBanner message={error} /> : <LoadingState />;
  const set = <K extends keyof Automations>(key: K, patch: Partial<Automations[K]>) =>
    setA((cur) => (cur ? { ...cur, [key]: { ...cur[key], ...patch } } : cur));
  const ro = !editable;

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      <PageHeader
        title="Automatisations"
        subtitle="Tâches automatiques de SENGA, chacune avec son interrupteur. Réservé au super administrateur."
      />
      {!editable && <p className="text-sm text-amber-700">Lecture seule : réservé au super administrateur.</p>}
      {error && <ErrorBanner message={error} />}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Rapport quotidien</h2>
        <p className="text-sm text-slate-600">
          Chaque matin, un résumé de la veille (courses, livraisons, revenus, commissions, annulations) arrive dans les
          alertes de l&apos;admin (cloche).
        </p>
        <Toggle label="Activé" checked={a.dailyReport.enabled} disabled={ro} onChange={(v) => set("dailyReport", { enabled: v })} />
        <Num label="Heure d'envoi (Kinshasa, 0–23)" value={a.dailyReport.hourKinshasa} disabled={ro} onChange={(v) => set("dailyReport", { hourKinshasa: v })} />
        {editable && (
          <BtnPrimary disabled={saving === "dailyReport"} onClick={() => void save("dailyReport", a.dailyReport)}>
            {saving === "dailyReport" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Alertes d&apos;anomalie</h2>
        <p className="text-sm text-slate-600">
          Toutes les heures, par ville : alerte si les annulations dépassent le seuil (avec assez de demandes) ou si des
          passagers restent sans chauffeur (attente de plus de 10 minutes ou abandon).
        </p>
        <Toggle label="Activé" checked={a.anomalyAlerts.enabled} disabled={ro} onChange={(v) => set("anomalyAlerts", { enabled: v })} />
        <div className="flex flex-wrap gap-4">
          <Num label="Demandes minimum / heure" value={a.anomalyAlerts.minRequestsPerHour} disabled={ro} onChange={(v) => set("anomalyAlerts", { minRequestsPerHour: v })} />
          <Num label="Seuil d'annulations (%)" value={a.anomalyAlerts.cancelRatePct} disabled={ro} onChange={(v) => set("anomalyAlerts", { cancelRatePct: v })} />
          <Num label="Passagers sans chauffeur / heure" value={a.anomalyAlerts.unservedPerHour} disabled={ro} onChange={(v) => set("anomalyAlerts", { unservedPerHour: v })} />
        </div>
        {editable && (
          <BtnPrimary disabled={saving === "anomalyAlerts"} onClick={() => void save("anomalyAlerts", a.anomalyAlerts)}>
            {saving === "anomalyAlerts" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Rappels de documents chauffeurs</h2>
        <p className="text-sm text-slate-600">
          Permis, assurance, contrôle technique et vignette : rappel au chauffeur avant l&apos;expiration (notification ;
          SMS en plus à partir de 7 jours). Envoyé le matin, une seule fois par étape.
        </p>
        <Toggle label="Activé" checked={a.docExpiry.enabled} disabled={ro} onChange={(v) => set("docExpiry", { enabled: v })} />
        <label className="text-sm text-slate-700 block">
          Jours avant l&apos;expiration (séparés par des virgules)
          <input
            className="mt-1 block w-48 rounded border border-slate-300 px-2 py-1"
            value={daysText}
            disabled={ro}
            onChange={(e) => setDaysText(e.target.value)}
          />
        </label>
        {editable && (
          <BtnPrimary
            disabled={saving === "docExpiry"}
            onClick={() =>
              void save("docExpiry", {
                enabled: a.docExpiry.enabled,
                daysBefore: daysText
                  .split(/[,; ]+/)
                  .map((d) => Number(d))
                  .filter((d) => Number.isFinite(d) && d > 0),
              })
            }
          >
            {saving === "docExpiry" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Suivi des dettes espèces</h2>
        <p className="text-sm text-slate-600">
          Rappel quotidien (SMS et notification, en fin de matinée) aux chauffeurs qui doivent des espèces à SENGA depuis
          plus du délai. Option : suspendre leurs missions si la plus ancienne dette dépasse N jours (0 = jamais).
        </p>
        <Toggle label="Activé" checked={a.cashDebt.enabled} disabled={ro} onChange={(v) => set("cashDebt", { enabled: v })} />
        <div className="flex flex-wrap gap-4">
          <Num label="Rappel après (heures)" value={a.cashDebt.remindAfterHours} disabled={ro} onChange={(v) => set("cashDebt", { remindAfterHours: v })} />
          <Num label="Suspendre après (jours, 0 = jamais)" value={a.cashDebt.blockAfterDays} disabled={ro} onChange={(v) => set("cashDebt", { blockAfterDays: v })} />
        </div>
        {editable && (
          <BtnPrimary disabled={saving === "cashDebt"} onClick={() => void save("cashDebt", a.cashDebt)}>
            {saving === "cashDebt" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Bonus chauffeurs</h2>
        <p className="text-sm text-slate-600">
          Prime versée par SENGA dans le portefeuille du chauffeur ou livreur qui atteint un nombre de missions dans la
          journée (courses, livraisons, courses &amp; commissions). Payée la nuit suivante ; l&apos;app chauffeur montre
          la progression. <strong>Coûte de l&apos;argent à SENGA</strong> : désactivé par défaut.
        </p>
        <Toggle label="Activé" checked={a.driverBonus.enabled} disabled={ro} onChange={(v) => set("driverBonus", { enabled: v })} />
        <div className="flex flex-wrap gap-4">
          <Num label="Palier 1 : missions" value={a.driverBonus.minJobs} disabled={ro} onChange={(v) => set("driverBonus", { minJobs: v })} />
          <Num label="Palier 1 : prime (FC)" value={a.driverBonus.bonusCdf} disabled={ro} onChange={(v) => set("driverBonus", { bonusCdf: v })} />
          <Num label="Palier 2 : missions (0 = aucun)" value={a.driverBonus.minJobs2} disabled={ro} onChange={(v) => set("driverBonus", { minJobs2: v })} />
          <Num label="Palier 2 : prime (FC)" value={a.driverBonus.bonus2Cdf} disabled={ro} onChange={(v) => set("driverBonus", { bonus2Cdf: v })} />
        </div>
        {editable && (
          <BtnPrimary disabled={saving === "driverBonus"} onClick={() => void save("driverBonus", a.driverBonus)}>
            {saving === "driverBonus" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Carte de la demande (chauffeurs)</h2>
        <p className="text-sm text-slate-600">
          Dans SENGA Driver, « Zones de demande » montre où les clients ont demandé une course ou une livraison
          récemment (et ceux qui attendent encore), pour aller vers eux.
        </p>
        <Toggle label="Activé" checked={a.demandHeatmap.enabled} disabled={ro} onChange={(v) => set("demandHeatmap", { enabled: v })} />
        <Num label="Fenêtre (minutes, 5–180)" value={a.demandHeatmap.windowMinutes} disabled={ro} onChange={(v) => set("demandHeatmap", { windowMinutes: v })} />
        {editable && (
          <BtnPrimary disabled={saving === "demandHeatmap"} onClick={() => void save("demandHeatmap", a.demandHeatmap)}>
            {saving === "demandHeatmap" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Parrainage</h2>
        <p className="text-sm text-slate-600">
          Chaque utilisateur a un code à partager (Profil → Parrainage). Le nouvel utilisateur saisit le code dans les
          premiers jours ; quand il termine sa première course ou livraison, les deux reçoivent un crédit SENGA.
          <strong> Coûte de l&apos;argent à SENGA</strong> : désactivé par défaut.
        </p>
        <Toggle label="Activé" checked={a.referral.enabled} disabled={ro} onChange={(v) => set("referral", { enabled: v })} />
        <div className="flex flex-wrap gap-4">
          <Num label="Récompense parrain (FC)" value={a.referral.referrerRewardCdf} disabled={ro} onChange={(v) => set("referral", { referrerRewardCdf: v })} />
          <Num label="Récompense filleul (FC)" value={a.referral.refereeRewardCdf} disabled={ro} onChange={(v) => set("referral", { refereeRewardCdf: v })} />
          <Num label="Filleuls récompensés max / parrain" value={a.referral.maxPerReferrer} disabled={ro} onChange={(v) => set("referral", { maxPerReferrer: v })} />
          <Num label="Jours pour saisir un code" value={a.referral.codeEntryDays} disabled={ro} onChange={(v) => set("referral", { codeEntryDays: v })} />
        </div>
        {editable && (
          <BtnPrimary disabled={saving === "referral"} onClick={() => void save("referral", a.referral)}>
            {saving === "referral" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>
    </div>
  );
}
