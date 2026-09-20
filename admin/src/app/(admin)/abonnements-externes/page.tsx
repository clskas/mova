"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPlatformVendor,
  deletePlatformVendor,
  fetchPlatformVendors,
  runPlatformVendorAlerts,
  updatePlatformVendor,
  type PlatformVendor,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnGhost,
  BtnPrimary,
  Card,
  ErrorBanner,
  FieldLabel,
  LoadingState,
  PageHeader,
  SelectInput,
  TextInput,
} from "@/components/ui";

const CATEGORIES = [
  { value: "hosting", label: "Hébergement" },
  { value: "sms", label: "SMS / OTP" },
  { value: "payments", label: "Paiements" },
  { value: "maps", label: "Cartes" },
  { value: "store", label: "Stores (Play / Apple)" },
  { value: "domain", label: "Domaine / DNS" },
  { value: "other", label: "Autre" },
];

const CYCLES = [
  { value: "", label: "—" },
  { value: "monthly", label: "Mensuel" },
  { value: "yearly", label: "Annuel" },
  { value: "once", label: "Ponctuel" },
];

function toDateInput(iso?: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function urgencyLabel(v: PlatformVendor) {
  if (v.overdue) return "En retard / expiré";
  if (v.urgent) return `Urgent (${v.daysUntilSoonest} j)`;
  if (v.daysUntilSoonest != null) return `Dans ${v.daysUntilSoonest} j`;
  return "Dates à renseigner";
}

const emptyForm = {
  name: "",
  provider: "",
  category: "hosting",
  amountUsd: "",
  billingCycle: "monthly",
  nextPaymentAt: "",
  expiresAt: "",
  alertDaysBefore: "14",
  notifyEnabled: true,
  notes: "",
  url: "",
};

export default function AbonnementsExternesPage() {
  const { role, canWrite } = useAdmin();
  const readOnly = !canWrite("systeme") || role !== "SUPER_ADMIN";
  const [items, setItems] = useState<PlatformVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await fetchPlatformVendors());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger les abonnements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(v: PlatformVendor) {
    setEditingId(v.id);
    setForm({
      name: v.name,
      provider: v.provider,
      category: v.category || "other",
      amountUsd: v.amountUsd != null ? String(v.amountUsd) : "",
      billingCycle: v.billingCycle ?? "",
      nextPaymentAt: toDateInput(v.nextPaymentAt),
      expiresAt: toDateInput(v.expiresAt),
      alertDaysBefore: String(v.alertDaysBefore ?? 14),
      notifyEnabled: v.notifyEnabled !== false,
      notes: v.notes ?? "",
      url: v.url ?? "",
    });
  }

  function startCreate() {
    setEditingId("new");
    setForm(emptyForm);
  }

  async function save() {
    if (!form.name.trim() || !form.provider.trim()) {
      setError("Nom et fournisseur obligatoires.");
      return;
    }
    setSaving(true);
    setError(null);
    setOk(null);
    const payload = {
      name: form.name.trim(),
      provider: form.provider.trim(),
      category: form.category,
      amountUsd: form.amountUsd.trim() ? Number(form.amountUsd) : null,
      billingCycle: form.billingCycle || null,
      nextPaymentAt: form.nextPaymentAt || null,
      expiresAt: form.expiresAt || null,
      alertDaysBefore: Number(form.alertDaysBefore) || 14,
      notifyEnabled: form.notifyEnabled,
      notes: form.notes.trim() || null,
      url: form.url.trim() || null,
    };
    try {
      if (editingId === "new") await createPlatformVendor(payload);
      else if (editingId) await updatePlatformVendor(editingId, payload);
      setEditingId(null);
      setOk("Enregistré. Les Super Admin recevront SMS/e-mail avant échéance si la case alerte est cochée.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Supprimer cet abonnement ?")) return;
    setSaving(true);
    try {
      await deletePlatformVendor(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec suppression");
    } finally {
      setSaving(false);
    }
  }

  async function triggerAlerts() {
    setSaving(true);
    setError(null);
    try {
      const r = await runPlatformVendorAlerts();
      setOk(`Alertes envoyées : ${r.alerted} élément(s) dans la fenêtre d’alerte.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec alertes");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hébergements & plateformes"
        subtitle="Dates de paiement / expiration des services externes — alertes Super Admin pour éviter toute interruption SENGA."
      />
      {error && <ErrorBanner message={error} />}
      {ok && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{ok}</p>}

      <div className="flex flex-wrap gap-2">
        {!readOnly && (
          <>
            <BtnPrimary onClick={startCreate} disabled={saving}>
              Ajouter
            </BtnPrimary>
            <BtnGhost onClick={() => void triggerAlerts()} disabled={saving}>
              Envoyer alertes maintenant
            </BtnGhost>
          </>
        )}
      </div>

      {editingId && !readOnly && (
        <Card className="space-y-3 p-4">
          <p className="font-semibold text-sm">{editingId === "new" ? "Nouvel abonnement" : "Modifier"}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label>
              <FieldLabel>Nom *</FieldLabel>
              <TextInput value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            </label>
            <label>
              <FieldLabel>Fournisseur *</FieldLabel>
              <TextInput value={form.provider} onChange={(v) => setForm((f) => ({ ...f, provider: v }))} />
            </label>
            <label>
              <FieldLabel>Catégorie</FieldLabel>
              <SelectInput
                value={form.category}
                onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                options={CATEGORIES}
              />
            </label>
            <label>
              <FieldLabel>Cycle</FieldLabel>
              <SelectInput
                value={form.billingCycle}
                onChange={(v) => setForm((f) => ({ ...f, billingCycle: v }))}
                options={CYCLES}
              />
            </label>
            <label>
              <FieldLabel>Montant (USD)</FieldLabel>
              <TextInput value={form.amountUsd} onChange={(v) => setForm((f) => ({ ...f, amountUsd: v }))} />
            </label>
            <label>
              <FieldLabel>Alerte (jours avant)</FieldLabel>
              <TextInput
                value={form.alertDaysBefore}
                onChange={(v) => setForm((f) => ({ ...f, alertDaysBefore: v }))}
              />
            </label>
            <label>
              <FieldLabel>Prochain paiement</FieldLabel>
              <input
                type="date"
                className="mova-input w-full"
                value={form.nextPaymentAt}
                onChange={(e) => setForm((f) => ({ ...f, nextPaymentAt: e.target.value }))}
              />
            </label>
            <label>
              <FieldLabel>Expiration</FieldLabel>
              <input
                type="date"
                className="mova-input w-full"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>URL console</FieldLabel>
              <TextInput value={form.url} onChange={(v) => setForm((f) => ({ ...f, url: v }))} />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Notes</FieldLabel>
              <TextInput value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.notifyEnabled}
                onChange={(e) => setForm((f) => ({ ...f, notifyEnabled: e.target.checked }))}
              />
              Notifier les Super Admin (SMS / e-mail) avant échéance
            </label>
          </div>
          <div className="flex gap-2">
            <BtnPrimary onClick={() => void save()} disabled={saving}>
              {saving ? "…" : "Enregistrer"}
            </BtnPrimary>
            <BtnGhost onClick={() => setEditingId(null)}>Annuler</BtnGhost>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-gray-500">Aucun abonnement. Ajoutez Render, Play Store, SMS, domaine…</p>
        )}
        {items.map((v) => (
          <Card
            key={v.id}
            className={`p-4 space-y-2 ${v.overdue ? "border-red-300 bg-red-50" : v.urgent ? "border-amber-300 bg-amber-50" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-[#1A1A2E]">{v.name}</p>
                <p className="text-xs text-gray-500">
                  {v.provider} · {CATEGORIES.find((c) => c.value === v.category)?.label ?? v.category}
                  {v.amountUsd != null ? ` · ${v.amountUsd} USD` : ""}
                  {v.billingCycle ? ` · ${v.billingCycle}` : ""}
                </p>
              </div>
              <span
                className={`text-xs font-medium px-2 py-1 rounded-lg ${
                  v.overdue
                    ? "bg-red-600 text-white"
                    : v.urgent
                      ? "bg-amber-500 text-white"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {urgencyLabel(v)}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-1 text-sm text-gray-700">
              <p>
                Prochain paiement :{" "}
                <strong>{v.nextPaymentAt ? toDateInput(v.nextPaymentAt) : "—"}</strong>
                {v.daysUntilPayment != null ? ` (${v.daysUntilPayment} j)` : ""}
              </p>
              <p>
                Expiration : <strong>{v.expiresAt ? toDateInput(v.expiresAt) : "—"}</strong>
                {v.daysUntilExpiry != null ? ` (${v.daysUntilExpiry} j)` : ""}
              </p>
            </div>
            {v.notes && <p className="text-xs text-gray-600">{v.notes}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {v.url && (
                <a href={v.url} target="_blank" rel="noreferrer" className="text-xs text-[#6C63FF] underline">
                  Ouvrir la console
                </a>
              )}
              {!readOnly && (
                <>
                  <button type="button" className="text-xs text-[#6C63FF] underline" onClick={() => startEdit(v)}>
                    Modifier
                  </button>
                  <button type="button" className="text-xs text-red-600 underline" onClick={() => void remove(v.id)}>
                    Supprimer
                  </button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {readOnly && (
        <p className="text-xs text-gray-500">Réservé au Super Admin (lecture/écriture système).</p>
      )}
    </div>
  );
}
