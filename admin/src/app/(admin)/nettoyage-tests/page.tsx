"use client";

import { useState } from "react";
import { applyTestCleanup, previewTestCleanup, type TestCleanupPreview } from "@/lib/api";
import { BtnDanger, BtnPrimary, Card, EmptyState, ErrorBanner, PageHeader, TextInput } from "@/components/ui";

const TYPE_LABELS: Record<string, string> = {
  RIDE: "Course",
  DELIVERY: "Livraison",
  ERRAND: "Courses & commissions",
  MOVING: "Déménagement",
  RENTAL: "Location",
  CARPOOL: "Covoiturage",
  SCHEDULED: "Course planifiée",
};

const cdf = (n: number) => `${Math.round(n).toLocaleString("fr-CD")} FC`;

/**
 * Courses / services de test terminées en moins de N minutes : aperçu (rien n'est modifié), puis
 * annulation comptable des éléments cochés — les écritures d'argent sont contre-passées, rien
 * n'est effacé. Réservé au super admin.
 */
export default function TestCleanupPage() {
  const [before, setBefore] = useState("");
  const [accounts, setAccounts] = useState("");
  const [maxMinutes, setMaxMinutes] = useState("5");
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [preview, setPreview] = useState<TestCleanupPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const filter = () => ({
    before: before.trim() || undefined,
    accounts: accounts.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean),
    maxMinutes: Number(maxMinutes) || 5,
    includeCancelled,
  });

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await previewTestCleanup(filter());
      setPreview(res);
      setSelected(new Set(res.items.map((i) => i.key)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur aperçu");
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    if (!preview || selected.size === 0) return;
    const typed = window.prompt(
      `Annuler en comptabilité ${selected.size} élément(s) de test ?\nLes écritures d'argent seront contre-passées (rien n'est effacé).\nTapez ANNULER pour confirmer.`,
    );
    if (typed?.trim().toUpperCase() !== "ANNULER") return;
    setBusy(true);
    setError(null);
    try {
      const res = await applyTestCleanup({ ...filter(), confirmKeys: Array.from(selected) });
      const failed = (res.money?.items ?? []).reduce((s, i) => s + (i.failed?.length ?? 0), 0);
      setDone(
        `${res.count} élément(s) annulé(s).` +
          (failed > 0 ? ` ${failed} écriture(s) n'ont pas pu être contre-passées (solde insuffisant) : à régulariser à la main dans Portefeuille.` : ""),
      );
      setPreview(null);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur annulation");
    } finally {
      setBusy(false);
    }
  };

  const moneyByKey = new Map(
    (preview?.money?.items ?? []).map((m) => [`${m.referenceType}:${m.referenceId}`, m]),
  );
  const selectedCommission = (preview?.money?.items ?? [])
    .filter((m) => selected.has(`${m.referenceType}:${m.referenceId}`))
    .reduce((s, m) => s + (m.platformCommissionCdf ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <PageHeader
        title="Nettoyage des tests"
        subtitle="Courses (taxi, moto, Pool, planifiées), livraisons (colis, repas, express), courses & commissions, déménagements, location et covoiturage de test terminés trop vite : annulation comptable (rien n'est effacé). Super admin."
      />
      {error && <ErrorBanner message={error} />}
      {done && <Card className="border-green-300 bg-green-50 text-green-900">{done}</Card>}
      <Card className="space-y-3">
        <p className="text-sm text-gray-600">
          Indiquez au moins un filtre en plus de la durée, pour ne pas toucher de vraies courses courtes.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            Créés jusqu&apos;au (inclus)
            <TextInput type="date" value={before} onChange={setBefore} />
          </label>
          <label className="text-sm">
            Durée réelle inférieure à (minutes)
            <TextInput type="number" value={maxMinutes} onChange={setMaxMinutes} min="1" max="30" />
          </label>
          <label className="text-sm md:col-span-3">
            Comptes de test (téléphones ou identifiants, un par ligne) — optionnel
            <textarea
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              rows={3}
              value={accounts}
              onChange={(e) => setAccounts(e.target.value)}
              placeholder={"+243 81 000 0000\n+243 99 000 0000"}
            />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={includeCancelled} onChange={(e) => setIncludeCancelled(e.target.checked)} />
          <span>
            Inclure aussi les <strong>demandes annulées</strong> (quelle que soit leur durée) : elles sortent des rapports
            (taux d&apos;annulation) et leurs frais d&apos;annulation éventuels sont annulés. Rien n&apos;est effacé.
          </span>
        </label>
        <BtnPrimary onClick={runPreview} disabled={busy}>
          {busy ? "…" : "Voir l'aperçu (ne modifie rien)"}
        </BtnPrimary>
      </Card>

      {preview && (
        <Card className="space-y-3">
          {(preview.unknownAccounts?.length ?? 0) > 0 && (
            <ErrorBanner message={`Comptes introuvables : ${preview.unknownAccounts!.join(", ")}`} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              {preview.count} élément(s) trouvé(s) · {selected.size} coché(s) · commission plateforme à retirer :{" "}
              <strong>{cdf(selectedCommission)}</strong>
            </p>
            <BtnDanger onClick={runApply} disabled={busy || selected.size === 0}>
              Annuler en comptabilité ({selected.size})
            </BtnDanger>
          </div>
          {preview.items.length === 0 ? (
            <EmptyState message="Aucun élément de test pour ce filtre." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-2">
                      <input
                        type="checkbox"
                        checked={selected.size === preview.items.length}
                        onChange={(e) => setSelected(e.target.checked ? new Set(preview.items.map((i) => i.key)) : new Set())}
                      />
                    </th>
                    <th className="p-2">Date</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Trajet / objet</th>
                    <th className="p-2">Durée</th>
                    <th className="p-2">Prix</th>
                    <th className="p-2">Commission</th>
                    <th className="p-2">Écritures</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((i) => {
                    const m = moneyByKey.get(i.key);
                    return (
                      <tr key={i.key} className="border-b">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selected.has(i.key)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(i.key);
                              else next.delete(i.key);
                              setSelected(next);
                            }}
                          />
                        </td>
                        <td className="p-2 whitespace-nowrap">{new Date(i.createdAt).toLocaleString("fr-CD")}</td>
                        <td className="p-2">{TYPE_LABELS[i.type] ?? i.type}</td>
                        <td className="p-2">{i.label}</td>
                        <td className="p-2 whitespace-nowrap">{i.durationMin} min</td>
                        <td className="p-2 whitespace-nowrap">{cdf(i.priceCdf)}</td>
                        <td className="p-2 whitespace-nowrap">{cdf(m?.platformCommissionCdf ?? 0)}</td>
                        <td className="p-2">
                          {(m?.lines?.length ?? 0)} écriture(s)
                          {(m?.openDebts?.length ?? 0) > 0 ? ` · ${m!.openDebts!.length} dette(s) espèces` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
