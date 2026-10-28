"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPromoCode,
  deactivatePromoCode,
  fetchPromoCodes,
  type PromoCode,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { downloadCsv } from "@/lib/export-csv";
import {
  BtnDanger,
  BtnGhost,
  BtnPrimary,
  Card,
  EmptyState,
  ErrorBanner,
  FieldLabel,
  LoadingState,
  PageHeader,
  TextInput,
} from "@/components/ui";

export default function CampagnesPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("campagnes") && !canWrite("promos") && !canWrite("tarifs");
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("10");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCodes(await fetchPromoCodes());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur campagnes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = codes.filter((c) => c.isActive !== false);

  async function create() {
    if (readOnly || !code.trim()) return;
    setSaving(true);
    try {
      await createPromoCode({
        code: code.trim().toUpperCase(),
        discountPercent: Number(percent) || 10,
      });
      setCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PageHeader
        title="Campagnes promo"
        subtitle="Codes promo plateforme (réutilise le moteur SENGA existant)"
        action={
          <BtnGhost
            onClick={() =>
              downloadCsv(
                "senga-campagnes.csv",
                ["Code", "Actif", "Utilisations", "%", "CDF"],
                codes.map((c) => [
                  c.code,
                  c.isActive === false ? "non" : "oui",
                  c.usedCount ?? 0,
                  c.discountPercent ?? "",
                  c.discountCdf ?? "",
                ]),
              )
            }
            disabled={!codes.length}
          >
            Export CSV
          </BtnGhost>
        }
      />
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <MetricCard label="Campagnes actives" value={active.length} accent="violet" />
        <MetricCard
          label="Utilisations"
          value={codes.reduce((s, c) => s + Number(c.usedCount ?? 0), 0)}
          accent="green"
        />
      </div>
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!readOnly && (
        <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-3 items-end">
          <label>
            <FieldLabel>Code</FieldLabel>
            <TextInput value={code} onChange={setCode} placeholder="SENGA10" />
          </label>
          <label>
            <FieldLabel>% réduction</FieldLabel>
            <TextInput value={percent} onChange={setPercent} placeholder="10" />
          </label>
          <BtnPrimary disabled={saving} onClick={() => void create()}>
            Créer
          </BtnPrimary>
        </div>
      )}
      {loading ? (
        <LoadingState />
      ) : codes.length === 0 ? (
        <EmptyState message="Aucun code promo" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Code</th>
                <th className="p-3">Réduction</th>
                <th className="p-3">Usages</th>
                <th className="p-3">Statut</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-3 font-mono font-medium">{c.code}</td>
                  <td className="p-3">
                    {c.discountPercent != null ? `${c.discountPercent}%` : null}
                    {c.discountCdf != null ? ` ${c.discountCdf} CDF` : null}
                  </td>
                  <td className="p-3">
                    {c.usedCount ?? 0}
                    {c.maxUses != null ? ` / ${c.maxUses}` : ""}
                  </td>
                  <td className="p-3 text-xs">{c.isActive === false ? "Inactif" : "Actif"}</td>
                  <td className="p-3">
                    {!readOnly && c.isActive !== false && (
                      <BtnDanger
                        onClick={async () => {
                          await deactivatePromoCode(c.id);
                          await load();
                        }}
                      >
                        Désactiver
                      </BtnDanger>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
