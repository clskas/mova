"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createSubscriptionPlan,
  fetchSubscriptionPlans,
  fetchSubscriptions,
  formatCdf,
  formatDate,
  updateSubscriptionPlan,
  type SubscriptionPlan,
  type SubscriptionRecord,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnDanger,
  BtnPrimary,
  Card,
  EmptyState,
  ErrorBanner,
  FieldLabel,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
  TextInput,
} from "@/components/ui";

export default function AbonnementsPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("abonnements");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subs, setSubs] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | SubscriptionPlan | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [benefits, setBenefits] = useState("");
  const [feeReduction, setFeeReduction] = useState("0");
  const [priorityMatching, setPriorityMatching] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([fetchSubscriptionPlans(), fetchSubscriptions()]);
      const subs = Array.isArray(s) ? s : [];
      const plansWithCounts = (Array.isArray(p) ? p : []).map((plan) => ({
        ...plan,
        subscriberCount: subs.filter(
          (x) => x.planId === plan.id && x.status === "ACTIVE",
        ).length,
      }));
      setPlans(plansWithCounts);
      setSubs(subs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setName("");
    setPrice("");
    setBenefits("");
    setFeeReduction("0");
    setPriorityMatching(false);
    setModal("create");
  }

  function openEdit(plan: SubscriptionPlan) {
    setName(plan.name);
    setPrice(String(plan.priceCdfPerMonth));
    setBenefits(plan.benefits.join("\n"));
    setFeeReduction(String(plan.feeReductionPercent ?? 0));
    setPriorityMatching(plan.priorityMatching ?? false);
    setModal(plan);
  }

  async function savePlan() {
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        priceCdfPerMonth: Number(price),
        benefits: benefits.split("\n").map((b) => b.trim()).filter(Boolean),
        feeReductionPercent: Number(feeReduction) || 0,
        priorityMatching,
      };
      if (modal === "create") {
        await createSubscriptionPlan(payload);
      } else if (modal) {
        await updateSubscriptionPlan(modal.id, payload);
      }
      setModal(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(plan: SubscriptionPlan) {
    try {
      await updateSubscriptionPlan(plan.id, { isActive: !plan.isActive });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec mise à jour");
    }
  }

  const totalSubs = plans.reduce((n, p) => n + (p.subscriberCount ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <PageHeader
        title="Abonnements"
        subtitle={`${totalSubs} abonnés actifs · plans MOVA Plus`}
        action={!readOnly ? <BtnPrimary onClick={openCreate}>Nouveau plan</BtnPrimary> : undefined}
      />
      {error && <ErrorBanner message={error} onRetry={load} />}

      <Card className="p-4 bg-violet-50 border-violet-100 text-sm text-gray-700 space-y-2">
        <p className="font-semibold text-[#6C63FF]">Pourquoi les abonnements MOVA Plus ?</p>
        <p>
          Un abonnement mensuel en CDF fidélise les passagers réguliers (trajets domicile-travail,
          livraisons récurrentes) : réduction sur les frais de service, priorité d&apos;assignation
          chauffeur en heure de pointe et revenus prévisibles pour la plateforme.
        </p>
      </Card>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="p-3">Plan</th>
                  <th className="p-3">Prix / mois</th>
                  <th className="p-3">Avantages</th>
                  <th className="p-3">Abonnés</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {plans.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState message="Aucun plan" /></td></tr>
                ) : plans.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-[#6C63FF]">{formatCdf(p.priceCdfPerMonth)}</td>
                    <td className="p-3 text-gray-600 max-w-xs">
                      <ul className="list-disc list-inside text-xs space-y-0.5">
                        {p.benefits.map((b) => <li key={b}>{b}</li>)}
                      </ul>
                    </td>
                    <td className="p-3">{p.subscriberCount ?? 0}</td>
                    <td className="p-3">
                      <StatusBadge status={p.isActive ? "ACTIVE" : "SUSPENDED"} />
                    </td>
                    <td className="p-3 flex gap-2 flex-wrap">
                      {!readOnly && (
                        <>
                          <button type="button" onClick={() => openEdit(p)} className="text-sm text-[#6C63FF] hover:underline">Modifier</button>
                          <button type="button" onClick={() => toggleActive(p)} className="text-sm text-gray-500 hover:underline">
                            {p.isActive ? "Désactiver" : "Activer"}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <section>
            <h2 className="font-semibold mb-3">Abonnements récents</h2>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Utilisateur</th>
                    <th className="p-3">Plan</th>
                    <th className="p-3">Statut</th>
                    <th className="p-3">Début</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.length === 0 ? (
                    <tr><td colSpan={4}><EmptyState message="Aucun abonné" /></td></tr>
                  ) : subs.map((s) => (
                    <tr key={s.id} className="border-b">
                      <td className="p-3 font-mono text-xs">{s.userId}</td>
                      <td className="p-3">{s.planName ?? s.planId}</td>
                      <td className="p-3"><StatusBadge status={s.status} /></td>
                      <td className="p-3 text-gray-500">{formatDate(s.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === "create" ? "Créer un plan" : "Modifier le plan"} wide>
        <div className="space-y-4">
          <label><FieldLabel>Nom</FieldLabel><TextInput value={name} onChange={setName} /></label>
          <label><FieldLabel>Prix CDF / mois</FieldLabel><TextInput value={price} onChange={setPrice} type="number" /></label>
          <label>
            <FieldLabel>Réduction frais de service (%)</FieldLabel>
            <TextInput value={feeReduction} onChange={setFeeReduction} type="number" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={priorityMatching}
              onChange={(e) => setPriorityMatching(e.target.checked)}
            />
            Priorité de matching (heures de pointe)
          </label>
          <label>
            <FieldLabel>Avantages (un par ligne)</FieldLabel>
            <textarea
              className="w-full rounded-xl border border-gray-200 p-3 text-sm min-h-[100px]"
              value={benefits}
              onChange={(e) => setBenefits(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <BtnPrimary onClick={savePlan} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</BtnPrimary>
            <BtnDanger onClick={() => setModal(null)}>Annuler</BtnDanger>
          </div>
        </div>
      </Modal>
    </div>
  );
}
