"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adjustWallet,
  apiFetch,
  fetchUserWallet,
  fetchWalletOverview,
  fetchWalletTransactions,
  formatCdf,
  formatDate,
  normalizeMetrics,
  type AdminMetrics,
  type UserWalletDetail,
  type WalletOverview,
  type WalletTransaction,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnPrimary,
  Card,
  ErrorBanner,
  FieldLabel,
  LoadingState,
  PageHeader,
  SelectInput,
  StatusBadge,
  TextInput,
} from "@/components/ui";

export default function PortefeuillePage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("portefeuille");
  const [metrics, setMetrics] = useState<AdminMetrics>({});
  const [wallet, setWallet] = useState<WalletOverview>({});
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [adjustUserId, setAdjustUserId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [adjustDesc, setAdjustDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [lookupUserId, setLookupUserId] = useState("");
  const [userWalletDetail, setUserWalletDetail] = useState<UserWalletDetail | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, w, tx] = await Promise.all([
        apiFetch<AdminMetrics>("/api/admin/metrics"),
        fetchWalletOverview(),
        fetchWalletTransactions(userId.trim() || undefined, 0, 50),
      ]);
      setMetrics(m);
      setWallet(w);
      setTransactions(tx.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function loadUserWalletDetail() {
    const id = lookupUserId.trim();
    if (!id) return;
    setLookupLoading(true);
    setError(null);
    try {
      const detail = await fetchUserWallet(id);
      setUserWalletDetail(detail);
      setAdjustUserId(id);
    } catch (e) {
      setUserWalletDetail(null);
      setError(e instanceof Error ? e.message : "Portefeuille introuvable");
    } finally {
      setLookupLoading(false);
    }
  }

  async function submitAdjust() {
    if (!adjustUserId.trim() || !adjustAmount.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await adjustWallet(adjustUserId.trim(), {
        amountCdf: Number(adjustAmount),
        type: adjustType,
        description: adjustDesc.trim() || "Ajustement manuel admin",
      });
      setAdjustAmount("");
      setAdjustDesc("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec ajustement");
    } finally {
      setSaving(false);
    }
  }

  const m = normalizeMetrics(metrics);

  const cards = [
    { label: "Revenus du jour", value: `${m.revenueTodayCdf.toLocaleString("fr-CD")} FC` },
    { label: "Solde agrégé wallets", value: `${(wallet.totalBalanceCdf ?? 0).toLocaleString("fr-CD")} FC` },
    { label: "Paiements en attente", value: `${(wallet.pendingPayoutsCdf ?? 0).toLocaleString("fr-CD")} FC` },
    { label: "Transactions aujourd'hui", value: wallet.transactionsToday ?? 0 },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader title="Portefeuille" subtitle="Vue finance · données réelles PostgreSQL" />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cards.map(({ label, value }) => (
              <Card key={label} className="p-5">
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-[#6C63FF] mt-1">{value}</p>
              </Card>
            ))}
          </div>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Détail portefeuille utilisateur</h2>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="flex-1 min-w-[200px]">
                <FieldLabel>ID utilisateur</FieldLabel>
                <TextInput value={lookupUserId} onChange={setLookupUserId} placeholder="UUID utilisateur" />
              </label>
              <BtnPrimary onClick={loadUserWalletDetail} disabled={lookupLoading}>
                {lookupLoading ? "Chargement…" : "Consulter"}
              </BtnPrimary>
            </div>
            {userWalletDetail && (
              <div className="rounded-xl bg-violet-50 border border-violet-100 p-4 text-sm">
                <p><span className="text-gray-500">Utilisateur:</span> <span className="font-mono text-xs">{userWalletDetail.userId}</span></p>
                <p className="mt-1 text-lg font-bold text-[#6C63FF]">
                  Solde: {formatCdf(userWalletDetail.balanceCdf ?? 0)}
                </p>
              </div>
            )}
          </Card>

          {!readOnly && (
            <Card className="p-5 space-y-4">
              <h2 className="font-semibold">Ajustement manuel</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <label><FieldLabel>ID utilisateur</FieldLabel><TextInput value={adjustUserId} onChange={setAdjustUserId} placeholder="UUID utilisateur" /></label>
                <label><FieldLabel>Montant CDF</FieldLabel><TextInput value={adjustAmount} onChange={setAdjustAmount} type="number" /></label>
                <label>
                  <FieldLabel>Type</FieldLabel>
                  <SelectInput value={adjustType} onChange={(v) => setAdjustType(v as "CREDIT" | "DEBIT")} options={[
                    { value: "CREDIT", label: "Crédit" },
                    { value: "DEBIT", label: "Débit" },
                  ]} />
                </label>
                <label><FieldLabel>Description</FieldLabel><TextInput value={adjustDesc} onChange={setAdjustDesc} placeholder="Motif de l'ajustement" /></label>
              </div>
              <BtnPrimary onClick={submitAdjust} disabled={saving}>{saving ? "En cours…" : "Appliquer l'ajustement"}</BtnPrimary>
            </Card>
          )}

          <section>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <h2 className="font-semibold flex-1">Transactions récentes</h2>
              <label className="text-sm">
                <FieldLabel>Filtrer par userId</FieldLabel>
                <TextInput value={userId} onChange={setUserId} placeholder="Optionnel" className="!w-64" />
              </label>
              <BtnPrimary onClick={load}>Filtrer</BtnPrimary>
            </div>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Date</th>
                    <th className="p-3">Utilisateur</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Montant</th>
                    <th className="p-3">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr><td colSpan={5} className="p-4 text-gray-500">Aucune transaction.</td></tr>
                  ) : transactions.map((t) => (
                    <tr key={t.id} className="border-b">
                      <td className="p-3 text-gray-500">{formatDate(t.createdAt)}</td>
                      <td className="p-3 font-mono text-xs">{t.wallet?.userId ?? "—"}</td>
                      <td className="p-3"><StatusBadge status={t.type} /></td>
                      <td className="p-3">{formatCdf(Math.abs(t.amountCdf))}</td>
                      <td className="p-3">{t.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
