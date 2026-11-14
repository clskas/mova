"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, fetchPlatformConfig, updatePlatformConfig } from "@/lib/api";
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
  subscriptions: { enabled: boolean; priorityBoost: number; autoRenew: boolean; remindDaysBefore: number };
  corporate: { enabled: boolean };
  faceCheck: { enabled: boolean; blockUntilChecked: boolean };
  routeAnomaly: { enabled: boolean; stopMinutes: number; detourKm: number };
  ratingQuality: { enabled: boolean; minAvg: number; minRatings: number; autoBlock: boolean };
  sentryDigest: { enabled: boolean; hourKinshasa: number };
  priceOffer: { enabled: boolean; minPct: number; maxPct: number };
  tips: { enabled: boolean; presetsCdf: number[]; maxCdf: number };
  favoriteDrivers: { enabled: boolean; priorityAttempts: number };
  womenPreference: { enabled: boolean };
  loyalty: { enabled: boolean; pointsPer1000Cdf: number; redeemPoints: number; redeemValueCdf: number };
};

type Blocked = { userId: string; qualityBlockedAt: string; qualityBlockReason?: string | null; ratingAvg?: number };

const DEFAULTS: Automations = {
  dailyReport: { enabled: true, hourKinshasa: 7 },
  anomalyAlerts: { enabled: true, minRequestsPerHour: 10, cancelRatePct: 60, unservedPerHour: 5 },
  docExpiry: { enabled: true, daysBefore: [30, 7, 1] },
  cashDebt: { enabled: true, remindAfterHours: 24, blockAfterDays: 0 },
  driverBonus: { enabled: false, minJobs: 10, bonusCdf: 5000, minJobs2: 20, bonus2Cdf: 12000 },
  demandHeatmap: { enabled: true, windowMinutes: 30 },
  referral: { enabled: false, referrerRewardCdf: 2000, refereeRewardCdf: 2000, maxPerReferrer: 20, codeEntryDays: 7 },
  subscriptions: { enabled: false, priorityBoost: 0.15, autoRenew: true, remindDaysBefore: 3 },
  corporate: { enabled: false },
  faceCheck: { enabled: false, blockUntilChecked: true },
  routeAnomaly: { enabled: true, stopMinutes: 10, detourKm: 3 },
  ratingQuality: { enabled: true, minAvg: 3.5, minRatings: 10, autoBlock: false },
  sentryDigest: { enabled: false, hourKinshasa: 8 },
  priceOffer: { enabled: false, minPct: 80, maxPct: 150 },
  tips: { enabled: false, presetsCdf: [500, 1000, 2000], maxCdf: 20000 },
  favoriteDrivers: { enabled: false, priorityAttempts: 1 },
  womenPreference: { enabled: false },
  loyalty: { enabled: false, pointsPer1000Cdf: 1, redeemPoints: 100, redeemValueCdf: 1000 },
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
  const [blocked, setBlocked] = useState<Blocked[]>([]);

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
        subscriptions: { ...DEFAULTS.subscriptions, ...cfg.subscriptions },
        corporate: { ...DEFAULTS.corporate, ...cfg.corporate },
        faceCheck: { ...DEFAULTS.faceCheck, ...cfg.faceCheck },
        routeAnomaly: { ...DEFAULTS.routeAnomaly, ...cfg.routeAnomaly },
        ratingQuality: { ...DEFAULTS.ratingQuality, ...cfg.ratingQuality },
        sentryDigest: { ...DEFAULTS.sentryDigest, ...cfg.sentryDigest },
        priceOffer: { ...DEFAULTS.priceOffer, ...cfg.priceOffer },
        tips: { ...DEFAULTS.tips, ...cfg.tips },
        favoriteDrivers: { ...DEFAULTS.favoriteDrivers, ...cfg.favoriteDrivers },
        womenPreference: { ...DEFAULTS.womenPreference, ...cfg.womenPreference },
        loyalty: { ...DEFAULTS.loyalty, ...cfg.loyalty },
      };
      setBlocked(await apiFetch<Blocked[]>("/api/admin/drivers-quality-blocked").catch(() => []));
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
          Alertes staff.
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

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">SENGA Plus (abonnements)</h2>
        <p className="text-sm text-slate-600">
          Applique automatiquement les avantages des plans (Tarifs → Abonnements) : réduction du passager sur ses
          courses (payée par SENGA), commission réduite pour le chauffeur abonné, priorité dans la répartition des
          courses, rappel avant la fin et renouvellement depuis le portefeuille.
        </p>
        <Toggle label="Activé" checked={a.subscriptions.enabled} disabled={ro} onChange={(v) => set("subscriptions", { enabled: v })} />
        <Toggle label="Renouvellement automatique" checked={a.subscriptions.autoRenew} disabled={ro} onChange={(v) => set("subscriptions", { autoRenew: v })} />
        <div className="flex flex-wrap gap-4">
          <Num label="Rappel (jours avant la fin)" value={a.subscriptions.remindDaysBefore} disabled={ro} onChange={(v) => set("subscriptions", { remindDaysBefore: v })} />
          <label className="text-sm text-slate-700">
            Priorité (bonus de score, 0 à 1)
            <input
              type="number"
              step="0.05"
              className="mt-1 block w-28 rounded border border-slate-300 px-2 py-1"
              value={a.subscriptions.priorityBoost}
              disabled={ro}
              onChange={(e) => set("subscriptions", { priorityBoost: Number(e.target.value) })}
            />
          </label>
        </div>
        {editable && (
          <BtnPrimary disabled={saving === "subscriptions"} onClick={() => void save("subscriptions", a.subscriptions)}>
            {saving === "subscriptions" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Comptes entreprises</h2>
        <p className="text-sm text-slate-600">
          Les membres d&apos;une entreprise peuvent choisir « Payé par mon entreprise » pour leurs courses ; l&apos;entreprise
          règle SENGA à partir du relevé mensuel. Gestion des entreprises : <a className="text-violet-700 underline" href="/entreprises">Comptes entreprises</a>.
        </p>
        <Toggle label="Activé" checked={a.corporate.enabled} disabled={ro} onChange={(v) => set("corporate", { enabled: v })} />
        {editable && (
          <BtnPrimary disabled={saving === "corporate"} onClick={() => void save("corporate", a.corporate)}>
            {saving === "corporate" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Vérification du visage du chauffeur</h2>
        <p className="text-sm text-slate-600">
          Chaque jour, avant de passer en ligne, le chauffeur prend une selfie comparée par l&apos;IA à sa photo validée.
          Visage différent : refus et alerte à l&apos;équipe. Si l&apos;IA est coupée, le chauffeur peut travailler et
          l&apos;équipe est prévenue.
        </p>
        <Toggle label="Activé" checked={a.faceCheck.enabled} disabled={ro} onChange={(v) => set("faceCheck", { enabled: v })} />
        <Toggle label="Bloquer le passage en ligne tant que la selfie du jour n'est pas faite" checked={a.faceCheck.blockUntilChecked} disabled={ro} onChange={(v) => set("faceCheck", { blockUntilChecked: v })} />
        {editable && (
          <BtnPrimary disabled={saving === "faceCheck"} onClick={() => void save("faceCheck", a.faceCheck)}>
            {saving === "faceCheck" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Trajet anormal pendant une course</h2>
        <p className="text-sm text-slate-600">
          Toutes les 3 minutes : si une course en cours reste arrêtée longtemps loin de la destination, ou fait un grand
          détour, le passager reçoit « Tout va bien ? » (avec le bouton SOS) et l&apos;équipe une alerte.
        </p>
        <Toggle label="Activé" checked={a.routeAnomaly.enabled} disabled={ro} onChange={(v) => set("routeAnomaly", { enabled: v })} />
        <div className="flex flex-wrap gap-4">
          <Num label="Arrêt (minutes)" value={a.routeAnomaly.stopMinutes} disabled={ro} onChange={(v) => set("routeAnomaly", { stopMinutes: v })} />
          <Num label="Détour (km)" value={a.routeAnomaly.detourKm} disabled={ro} onChange={(v) => set("routeAnomaly", { detourKm: v })} />
        </div>
        {editable && (
          <BtnPrimary disabled={saving === "routeAnomaly"} onClick={() => void save("routeAnomaly", a.routeAnomaly)}>
            {saving === "routeAnomaly" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Qualité des chauffeurs (notes)</h2>
        <p className="text-sm text-slate-600">
          Chaque matin : alerte pour les chauffeurs dont la moyenne des dernières notes est sous le seuil. Option : les
          suspendre automatiquement (ils ne peuvent plus passer en ligne jusqu&apos;au déblocage ci-dessous). Les passagers
          peuvent aussi noter la propreté, la conduite, la ponctualité et l&apos;amabilité.
        </p>
        <Toggle label="Activé" checked={a.ratingQuality.enabled} disabled={ro} onChange={(v) => set("ratingQuality", { enabled: v })} />
        <Toggle label="Suspendre automatiquement sous le seuil" checked={a.ratingQuality.autoBlock} disabled={ro} onChange={(v) => set("ratingQuality", { autoBlock: v })} />
        <div className="flex flex-wrap gap-4">
          <label className="text-sm text-slate-700">
            Seuil (moyenne sur 5)
            <input
              type="number"
              step="0.1"
              className="mt-1 block w-28 rounded border border-slate-300 px-2 py-1"
              value={a.ratingQuality.minAvg}
              disabled={ro}
              onChange={(e) => set("ratingQuality", { minAvg: Number(e.target.value) })}
            />
          </label>
          <Num label="Sur les N dernières notes" value={a.ratingQuality.minRatings} disabled={ro} onChange={(v) => set("ratingQuality", { minRatings: v })} />
        </div>
        {editable && (
          <BtnPrimary disabled={saving === "ratingQuality"} onClick={() => void save("ratingQuality", a.ratingQuality)}>
            {saving === "ratingQuality" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
        {blocked.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-sm font-medium">Chauffeurs suspendus pour qualité</p>
            <ul className="mt-2 space-y-1 text-sm">
              {blocked.map((b) => (
                <li key={b.userId} className="flex items-center justify-between gap-2">
                  <span>
                    {b.userId.slice(0, 8)} — {b.qualityBlockReason ?? ""} ({new Date(b.qualityBlockedAt).toLocaleDateString("fr-FR")})
                  </span>
                  {editable && (
                    <button
                      className="text-xs text-violet-700 underline"
                      onClick={async () => {
                        if (!window.confirm("Débloquer ce chauffeur ?")) return;
                        await apiFetch(`/api/admin/drivers/${b.userId}/quality-unblock`, { method: "POST", body: "{}" });
                        await load();
                      }}
                    >
                      Débloquer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Résumé quotidien des erreurs (Sentry)</h2>
        <p className="text-sm text-slate-600">
          Chaque matin, les erreurs des applications vues en 24 h arrivent dans Alertes staff. Demande la
          variable <code>SENTRY_READ_TOKEN</code> (jeton Sentry en lecture seule, créé par vous) sur le service ride.
        </p>
        <Toggle label="Activé" checked={a.sentryDigest.enabled} disabled={ro} onChange={(v) => set("sentryDigest", { enabled: v })} />
        <Num label="Heure d'envoi (Kinshasa)" value={a.sentryDigest.hourKinshasa} disabled={ro} onChange={(v) => set("sentryDigest", { hourKinshasa: v })} />
        {editable && (
          <BtnPrimary disabled={saving === "sentryDigest"} onClick={() => void save("sentryDigest", a.sentryDigest)}>
            {saving === "sentryDigest" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>

      <h2 className="text-lg font-semibold pt-2">Croissance (nouvelles fonctions)</h2>
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Le passager propose son prix</h2>
        <p className="text-sm text-slate-600">
          Le passager peut proposer un autre prix que celui de SENGA, entre un minimum et un maximum (en % du prix SENGA). Les chauffeurs voient « prix proposé par le client » et acceptent ou non. Tant que personne n&apos;accepte, le passager peut augmenter son offre.
        </p>
        <Toggle label="Activé" checked={a.priceOffer.enabled} disabled={ro} onChange={(v) => set("priceOffer", { enabled: v })} />
        <Num label="Minimum (% du prix SENGA, 50–100)" value={a.priceOffer.minPct} disabled={ro} onChange={(v) => set("priceOffer", { minPct: v })} />
        <Num label="Maximum (% du prix SENGA, 100–300)" value={a.priceOffer.maxPct} disabled={ro} onChange={(v) => set("priceOffer", { maxPct: v })} />
        {editable && (
          <BtnPrimary disabled={saving === "priceOffer"} onClick={() => void save("priceOffer", a.priceOffer)}>
            {saving === "priceOffer" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Pourboire</h2>
        <p className="text-sm text-slate-600">
          Après la course, le passager peut laisser un pourboire depuis son portefeuille. 100 % pour le chauffeur, SENGA ne prend rien.
        </p>
        <Toggle label="Activé" checked={a.tips.enabled} disabled={ro} onChange={(v) => set("tips", { enabled: v })} />
        <Num label="Montant proposé 1 (FC)" value={a.tips.presetsCdf[0] ?? 0} disabled={ro} onChange={(v) => set("tips", { presetsCdf: [v, a.tips.presetsCdf[1] ?? 0, a.tips.presetsCdf[2] ?? 0] })} />
        <Num label="Montant proposé 2 (FC)" value={a.tips.presetsCdf[1] ?? 0} disabled={ro} onChange={(v) => set("tips", { presetsCdf: [a.tips.presetsCdf[0] ?? 0, v, a.tips.presetsCdf[2] ?? 0] })} />
        <Num label="Montant proposé 3 (FC)" value={a.tips.presetsCdf[2] ?? 0} disabled={ro} onChange={(v) => set("tips", { presetsCdf: [a.tips.presetsCdf[0] ?? 0, a.tips.presetsCdf[1] ?? 0, v] })} />
        <Num label="Pourboire maximum (FC)" value={a.tips.maxCdf} disabled={ro} onChange={(v) => set("tips", { maxCdf: v })} />
        {editable && (
          <BtnPrimary disabled={saving === "tips"} onClick={() => void save("tips", a.tips)}>
            {saving === "tips" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Chauffeurs favoris</h2>
        <p className="text-sm text-slate-600">
          Après une course, le passager peut ajouter le chauffeur à ses favoris (10 au maximum). Ses demandes partent d&apos;abord vers ses favoris disponibles, puis vers tous les chauffeurs.
        </p>
        <Toggle label="Activé" checked={a.favoriteDrivers.enabled} disabled={ro} onChange={(v) => set("favoriteDrivers", { enabled: v })} />
        <Num label="Tours de recherche réservés aux favoris (1–5)" value={a.favoriteDrivers.priorityAttempts} disabled={ro} onChange={(v) => set("favoriteDrivers", { priorityAttempts: v })} />
        {editable && (
          <BtnPrimary disabled={saving === "favoriteDrivers"} onClick={() => void save("favoriteDrivers", a.favoriteDrivers)}>
            {saving === "favoriteDrivers" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Chauffeure femme</h2>
        <p className="text-sm text-slate-600">
          Une passagère (genre indiqué dans son profil) peut demander une chauffeure femme : seules les chauffeures qui ont indiqué « Femme » dans leur profil reçoivent la course. Si aucune n&apos;est disponible, la passagère peut relancer sans cette option.
        </p>
        <Toggle label="Activé" checked={a.womenPreference.enabled} disabled={ro} onChange={(v) => set("womenPreference", { enabled: v })} />
        {editable && (
          <BtnPrimary disabled={saving === "womenPreference"} onClick={() => void save("womenPreference", a.womenPreference)}>
            {saving === "womenPreference" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Points de fidélité</h2>
        <p className="text-sm text-slate-600">
          Chaque course payée rapporte des points. Le passager échange ses points contre un crédit portefeuille. <strong>Coûte de l&apos;argent à SENGA</strong> : désactivé par défaut.
        </p>
        <Toggle label="Activé" checked={a.loyalty.enabled} disabled={ro} onChange={(v) => set("loyalty", { enabled: v })} />
        <Num label="Points par 1 000 FC payés" value={a.loyalty.pointsPer1000Cdf} disabled={ro} onChange={(v) => set("loyalty", { pointsPer1000Cdf: v })} />
        <Num label="Points à échanger" value={a.loyalty.redeemPoints} disabled={ro} onChange={(v) => set("loyalty", { redeemPoints: v })} />
        <Num label="Crédit obtenu (FC)" value={a.loyalty.redeemValueCdf} disabled={ro} onChange={(v) => set("loyalty", { redeemValueCdf: v })} />
        {editable && (
          <BtnPrimary disabled={saving === "loyalty"} onClick={() => void save("loyalty", a.loyalty)}>
            {saving === "loyalty" ? "…" : "Enregistrer"}
          </BtnPrimary>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold">Tâches gérées dans GitHub</h2>
        <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
          <li>
            <strong>Sauvegardes</strong> : chaque nuit, copie chiffrée de chaque base (30 jours) et, le 1er du mois, essai de
            restauration. Demande les secrets GitHub <code>BACKUP_DATABASE_URLS</code> et <code>BACKUP_PASSPHRASE</code>.
          </li>
          <li>
            <strong>Validation iOS</strong> : chaque matin, lecture de l&apos;état chez Apple ; une app validée ouvre un ticket
            GitHub. Rien n&apos;est soumis automatiquement.
          </li>
          <li>
            <strong>Test de bout en bout</strong> : à chaque mise en production, une course complète est jouée en
            pré-production (acceptation, trajet, paiement espèces confirmé).
          </li>
        </ul>
      </Card>
    </div>
  );
}
