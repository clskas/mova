"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adjustWallet,
  apiFetch,
  fetchCashDebts,
  fetchDebtPolicy,
  fetchUser,
  fetchUsers,
  fetchUserWallet,
  fetchWalletOverview,
  fetchWalletTransactions,
  formatCdf,
  formatDate,
  formatUserName,
  normalizeMetrics,
  sanitizeAdminError,
  settleCashDebt,
  confirmCashDebtByCode,
  updateDebtPolicy,
  withdrawWallet,
  type AdminMetrics,
  type AdminUser,
  type CashDebtsOverview,
  type DriverDebtPolicy,
  type UserWalletDetail,
  type WalletOverview,
  type WalletTransaction,
} from "@/lib/api";
import { exportWalletTransactionsCsv, printWalletReport } from "@/lib/wallet-reports";
import { isWalletRecharge, isWalletWithdraw, walletTxLabel } from "@/lib/wallet-movements";
import { MOVA_PLATFORM_USER_ID, MOVA_PLATFORM_WALLET_LABEL } from "@/lib/platform-wallet";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnGhost,
  BtnPrimary,
  Card,
  ErrorBanner,
  FieldLabel,
  LoadingState,
  PageHeader,
  SearchInput,
  SelectInput,
  StatusBadge,
  TextInput,
} from "@/components/ui";

const MOBILE_MONEY_PROVIDERS = [
  { value: "ORANGE_MONEY", label: "Orange Money" },
  { value: "MPESA", label: "M-Pesa" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
];

const DEBT_CATEGORY_LABELS: Record<string, string> = {
  PLATFORM_FEE: "Commission SENGA",
  RESTAURANT_SHARE: "Part restaurant",
  PARTNER_SHARE: "Part partenaire",
};

function debtCategoryLabel(category: string) {
  return DEBT_CATEGORY_LABELS[category] ?? category;
}

export default function PortefeuillePage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("portefeuille");
  const [metrics, setMetrics] = useState<AdminMetrics>({});
  const [wallet, setWallet] = useState<WalletOverview>({});
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterUserId, setFilterUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<AdminUser[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [adjustDesc, setAdjustDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [userWalletDetail, setUserWalletDetail] = useState<UserWalletDetail | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawProvider, setWithdrawProvider] = useState("ORANGE_MONEY");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);
  const [cashDebts, setCashDebts] = useState<CashDebtsOverview | null>(null);
  const [debtPolicy, setDebtPolicy] = useState<DriverDebtPolicy | null>(null);
  const [debtThresholdInput, setDebtThresholdInput] = useState("50000");
  const [debtPolicySaving, setDebtPolicySaving] = useState(false);
  const [settlingDebtId, setSettlingDebtId] = useState<string | null>(null);
  const [cashConfirmCode, setCashConfirmCode] = useState("");
  const [cashConfirmLoading, setCashConfirmLoading] = useState(false);
  const [cashConfirmSuccess, setCashConfirmSuccess] = useState<string | null>(null);
  const [platformTreasury, setPlatformTreasury] = useState<UserWalletDetail | null>(null);
  const [platformRechargeAmount, setPlatformRechargeAmount] = useState("");
  const [platformRechargeDesc, setPlatformRechargeDesc] = useState("");
  const [platformWithdrawAmount, setPlatformWithdrawAmount] = useState("");
  const [platformWithdrawPhone, setPlatformWithdrawPhone] = useState("");
  const [platformWithdrawProvider, setPlatformWithdrawProvider] = useState("ORANGE_MONEY");
  const [platformSaving, setPlatformSaving] = useState(false);
  const [platformSuccess, setPlatformSuccess] = useState<string | null>(null);
  const [txFilter, setTxFilter] = useState<"all" | "recharge" | "withdraw">("all");
  const [txLoadingMore, setTxLoadingMore] = useState(false);

  const TX_PAGE_SIZE = 100;

  const activeUserId = selectedUser?.id ?? (filterUserId.trim() || "");

  const filterLabel = useMemo(() => {
    if (selectedUser) return formatUserName(selectedUser);
    if (filterUserId.trim()) return filterUserId.trim();
    return undefined;
  }, [selectedUser, filterUserId]);

  const filteredTransactions = useMemo(() => {
    if (txFilter === "recharge") return transactions.filter(isWalletRecharge);
    if (txFilter === "withdraw") return transactions.filter(isWalletWithdraw);
    return transactions;
  }, [transactions, txFilter]);

  const rechargeCount = useMemo(() => transactions.filter(isWalletRecharge).length, [transactions]);
  const withdrawCount = useMemo(() => transactions.filter(isWalletWithdraw).length, [transactions]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const userId = filterUserId.trim() || selectedUser?.id || undefined;
      const [m, w, tx, debts, policy, treasury] = await Promise.all([
        apiFetch<AdminMetrics>("/api/admin/metrics"),
        fetchWalletOverview(),
        fetchWalletTransactions(userId, 0, TX_PAGE_SIZE),
        fetchCashDebts(userId),
        fetchDebtPolicy(),
        fetchUserWallet(MOVA_PLATFORM_USER_ID).catch(() => null),
      ]);
      setMetrics(m);
      setWallet(w);
      setTransactions(tx.data ?? []);
      setTxTotal(tx.total ?? tx.data?.length ?? 0);
      setCashDebts(debts);
      setDebtPolicy(policy);
      setPlatformTreasury(treasury);
      setDebtThresholdInput(String(policy.maxOpenDebtCdf ?? 50000));
    } catch (e) {
      setError(sanitizeAdminError(e instanceof Error ? e.message : "Erreur de chargement"));
    } finally {
      setLoading(false);
    }
  }, [filterUserId, selectedUser]);

  const loadMoreTransactions = useCallback(async () => {
    if (txLoadingMore || transactions.length >= txTotal) return;
    setTxLoadingMore(true);
    setError(null);
    try {
      const userId = filterUserId.trim() || selectedUser?.id || undefined;
      const tx = await fetchWalletTransactions(userId, transactions.length, TX_PAGE_SIZE);
      setTransactions((prev) => [...prev, ...(tx.data ?? [])]);
      setTxTotal(tx.total ?? transactions.length + (tx.data?.length ?? 0));
    } catch (e) {
      setError(sanitizeAdminError(e instanceof Error ? e.message : "Erreur de chargement"));
    } finally {
      setTxLoadingMore(false);
    }
  }, [filterUserId, selectedUser, transactions.length, txLoadingMore, txTotal]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const q = userSearch.trim();
    if (q.length < 2) {
      setUserSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setUserSearchLoading(true);
      try {
        const { data } = await fetchUsers(0, 12, q);
        setUserSearchResults(data);
      } catch {
        setUserSearchResults([]);
      } finally {
        setUserSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [userSearch]);

  async function loadUserWalletDetail(userId: string) {
    if (!userId) return;
    setLookupLoading(true);
    setError(null);
    setWithdrawSuccess(null);
    try {
      const [detail, user] = await Promise.all([
        fetchUserWallet(userId),
        fetchUser(userId).catch(() => null),
      ]);
      setUserWalletDetail(detail);
      if (user?.phone) setWithdrawPhone(user.phone);
    } catch (e) {
      setUserWalletDetail(null);
      setError(sanitizeAdminError(e instanceof Error ? e.message : "Portefeuille introuvable"));
    } finally {
      setLookupLoading(false);
    }
  }

  function selectUser(user: AdminUser) {
    setSelectedUser(user);
    setFilterUserId(user.id);
    setUserSearch(formatUserName(user));
    setUserSearchResults([]);
    void loadUserWalletDetail(user.id);
  }

  function clearUserSelection() {
    setSelectedUser(null);
    setFilterUserId("");
    setUserSearch("");
    setUserWalletDetail(null);
    setWithdrawPhone("");
    setWithdrawSuccess(null);
  }

  async function submitPlatformRecharge() {
    if (!platformRechargeAmount.trim()) return;
    setPlatformSaving(true);
    setError(null);
    setPlatformSuccess(null);
    try {
      const result = await adjustWallet(MOVA_PLATFORM_USER_ID, {
        amountCdf: Number(platformRechargeAmount),
        type: "CREDIT",
        description: platformRechargeDesc.trim() || "Apport trésorerie SENGA (admin)",
      });
      setPlatformSuccess(result.message ?? "Trésorerie créditée.");
      setPlatformRechargeAmount("");
      setPlatformRechargeDesc("");
      await load();
    } catch (e) {
      setError(sanitizeAdminError(e instanceof Error ? e.message : "Échec crédit trésorerie"));
    } finally {
      setPlatformSaving(false);
    }
  }

  async function submitPlatformWithdraw() {
    if (!platformWithdrawAmount.trim() || !platformWithdrawPhone.trim()) return;
    setPlatformSaving(true);
    setError(null);
    setPlatformSuccess(null);
    try {
      const result = await withdrawWallet(MOVA_PLATFORM_USER_ID, {
        amountCdf: Number(platformWithdrawAmount),
        provider: platformWithdrawProvider,
        phone: platformWithdrawPhone.trim(),
      });
      setPlatformSuccess(result.message ?? "Retrait trésorerie initié.");
      setPlatformWithdrawAmount("");
      await load();
    } catch (e) {
      setError(sanitizeAdminError(e instanceof Error ? e.message : "Échec retrait trésorerie"));
    } finally {
      setPlatformSaving(false);
    }
  }

  async function submitAdjust() {
    if (!activeUserId || !adjustAmount.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await adjustWallet(activeUserId, {
        amountCdf: Number(adjustAmount),
        type: adjustType,
        description: adjustDesc.trim() || "Ajustement manuel admin",
      });
      setAdjustAmount("");
      setAdjustDesc("");
      await loadUserWalletDetail(activeUserId);
      await load();
    } catch (e) {
      setError(sanitizeAdminError(e instanceof Error ? e.message : "Échec ajustement"));
    } finally {
      setSaving(false);
    }
  }

  async function submitWithdraw() {
    if (!activeUserId || !withdrawAmount.trim() || !withdrawPhone.trim()) return;
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount < 500) {
      setError("Montant minimum de retrait : 500 FC");
      return;
    }
    setWithdrawing(true);
    setError(null);
    setWithdrawSuccess(null);
    try {
      const result = await withdrawWallet(activeUserId, {
        amountCdf: amount,
        provider: withdrawProvider,
        phone: withdrawPhone.trim(),
      });
      setWithdrawAmount("");
      setWithdrawSuccess(result.message ?? "Retrait initié avec succès.");
      await loadUserWalletDetail(activeUserId);
      await load();
    } catch (e) {
      setError(sanitizeAdminError(e instanceof Error ? e.message : "Échec du retrait"));
    } finally {
      setWithdrawing(false);
    }
  }

  async function submitSettleDebt(debtId: string) {
    if (!window.confirm("Marquer cette dette comme réglée ?")) return;
    setSettlingDebtId(debtId);
    setError(null);
    try {
      await settleCashDebt(debtId);
      await load();
    } catch (e) {
      setError(sanitizeAdminError(e instanceof Error ? e.message : "Échec du règlement"));
    } finally {
      setSettlingDebtId(null);
    }
  }

  async function submitConfirmCashDebt() {
    const code = cashConfirmCode.replace(/\s/g, "").trim();
    if (!/^\d{6}$/.test(code)) {
      setError("Saisissez le code à 6 chiffres affiché sur l'app chauffeur.");
      return;
    }
    setCashConfirmLoading(true);
    setError(null);
    setCashConfirmSuccess(null);
    try {
      const result = await confirmCashDebtByCode(code);
      if (!result.confirmed) {
        setError(result.message ?? "Code invalide ou expiré");
        return;
      }
      setCashConfirmSuccess(
        result.message ??
          `Paiement confirmé${result.amountCdf != null ? ` — ${formatCdf(result.amountCdf)}` : ""}.`,
      );
      setCashConfirmCode("");
      await load();
    } catch (e) {
      setError(sanitizeAdminError(e instanceof Error ? e.message : "Échec de la confirmation"));
    } finally {
      setCashConfirmLoading(false);
    }
  }

  const m = normalizeMetrics(metrics);

  const cards = [
    { label: "Trésorerie SENGA", value: `${(wallet.platformBalanceCdf ?? platformTreasury?.balanceCdf ?? 0).toLocaleString("fr-CD")} FC` },
    { label: "Dettes utilisateurs (wallets)", value: `${(wallet.userLiabilitiesCdf ?? 0).toLocaleString("fr-CD")} FC` },
    { label: "Revenus du jour", value: `${m.revenueTodayCdf.toLocaleString("fr-CD")} FC` },
    { label: "Solde agrégé (tous wallets)", value: `${(wallet.totalBalanceCdf ?? 0).toLocaleString("fr-CD")} FC` },
    { label: "Dettes espèces chauffeurs", value: `${(cashDebts?.totalOpenCdf ?? 0).toLocaleString("fr-CD")} FC` },
    { label: "Transactions aujourd'hui", value: wallet.transactionsToday ?? 0 },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Portefeuille"
        subtitle="Vue finance · retraits Mobile Money · rapports imprimables"
        action={
          !loading ? (
            <div className="flex flex-wrap gap-2">
              <BtnGhost onClick={() => exportWalletTransactionsCsv(transactions, wallet, m, filterLabel, cashDebts ?? undefined)}>
                Exporter CSV
              </BtnGhost>
              <BtnGhost onClick={() => printWalletReport(transactions, wallet, m, filterLabel, cashDebts ?? undefined)}>
                Imprimer rapport
              </BtnGhost>
            </div>
          ) : undefined
        }
      />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {withdrawSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {withdrawSuccess}
        </div>
      )}
      {platformSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {platformSuccess}
        </div>
      )}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map(({ label, value }) => (
              <Card key={label} className="p-5">
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-[#6C63FF] mt-1">{value}</p>
              </Card>
            ))}
          </div>

          <Card className="p-5 space-y-4 border-2 border-violet-200 bg-violet-50/40">
            <div>
              <h2 className="font-semibold text-lg">{MOVA_PLATFORM_WALLET_LABEL}</h2>
              <p className="text-sm text-gray-600 mt-1">
                Compte virtuel des commissions SENGA. Il se crédite automatiquement à chaque paiement (wallet ou espèces).
                Les espèces collectées chez les chauffeurs se régularisent au guichet — voir section « Confirmer paiement espèces ».
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl bg-white border p-4">
                <p className="text-gray-500">Solde trésorerie</p>
                <p className="text-2xl font-bold text-[#6C63FF] mt-1">
                  {formatCdf(wallet.platformBalanceCdf ?? platformTreasury?.balanceCdf ?? 0)}
                </p>
              </div>
              <div className="rounded-xl bg-white border p-4">
                <p className="text-gray-500">Passif utilisateurs (à honorer)</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">
                  {formatCdf(wallet.userLiabilitiesCdf ?? 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Somme des wallets passagers, chauffeurs et partenaires</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Compte trésorerie interne SENGA (réservé à l&apos;administration)
            </p>
            {!readOnly && (
              <div className="grid lg:grid-cols-2 gap-6 pt-2">
                <div className="space-y-3">
                  <h3 className="font-medium">Recharger la trésorerie (apport virtuel)</h3>
                  <p className="text-xs text-gray-500">
                    Injecte des fonds virtuels (float initial, correction comptable). En production, cela reflète un dépôt réel sur le compte SENGA.
                  </p>
                  <label>
                    <FieldLabel>Montant CDF</FieldLabel>
                    <TextInput
                      value={platformRechargeAmount}
                      onChange={setPlatformRechargeAmount}
                      type="number"
                      placeholder="100000"
                    />
                  </label>
                  <label>
                    <FieldLabel>Motif</FieldLabel>
                    <TextInput
                      value={platformRechargeDesc}
                      onChange={setPlatformRechargeDesc}
                      placeholder="Apport capital / float Mobile Money"
                    />
                  </label>
                  <BtnPrimary onClick={submitPlatformRecharge} disabled={platformSaving || !platformRechargeAmount.trim()}>
                    {platformSaving ? "En cours…" : "Créditer la trésorerie"}
                  </BtnPrimary>
                </div>
                <div className="space-y-3">
                  <h3 className="font-medium">Retirer vers Mobile Money (sortie réelle)</h3>
                  <p className="text-xs text-gray-500">
                    Transfère des fonds du compte trésorerie SENGA vers un numéro Orange / M-Pesa / Airtel (compte société).
                  </p>
                  <label>
                    <FieldLabel>Montant CDF</FieldLabel>
                    <TextInput
                      value={platformWithdrawAmount}
                      onChange={setPlatformWithdrawAmount}
                      type="number"
                      placeholder="50000"
                    />
                  </label>
                  <label>
                    <FieldLabel>Opérateur</FieldLabel>
                    <SelectInput
                      value={platformWithdrawProvider}
                      onChange={setPlatformWithdrawProvider}
                      options={MOBILE_MONEY_PROVIDERS}
                    />
                  </label>
                  <label>
                    <FieldLabel>Numéro compte SENGA (+243…)</FieldLabel>
                    <TextInput
                      value={platformWithdrawPhone}
                      onChange={setPlatformWithdrawPhone}
                      placeholder="+243812345678"
                    />
                  </label>
                  <BtnPrimary
                    onClick={submitPlatformWithdraw}
                    disabled={platformSaving || !platformWithdrawAmount.trim() || !platformWithdrawPhone.trim()}
                  >
                    {platformSaving ? "Retrait…" : "Retirer de la trésorerie"}
                  </BtnPrimary>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Rechercher un portefeuille</h2>
              {selectedUser && (
                <BtnGhost onClick={clearUserSelection}>Effacer la sélection</BtnGhost>
              )}
            </div>
            <div className="relative">
              <FieldLabel>Nom, téléphone ou ID utilisateur</FieldLabel>
              <SearchInput
                value={userSearch}
                onChange={setUserSearch}
                placeholder="Ex. Jean, +24381…, ou UUID"
              />
              {userSearchLoading && (
                <p className="text-xs text-gray-500 mt-1">Recherche…</p>
              )}
              {userSearchResults.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                  {userSearchResults.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-violet-50 border-b last:border-b-0"
                        onClick={() => selectUser(u)}
                      >
                        <p className="font-medium">{formatUserName(u)}</p>
                        <p className="text-xs text-gray-500">
                          {u.phone ?? "—"} · {u.role ?? "—"} · <span className="font-mono">{u.id.slice(0, 8)}…</span>
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selectedUser && (
              <BtnPrimary onClick={() => loadUserWalletDetail(selectedUser.id)} disabled={lookupLoading}>
                {lookupLoading ? "Chargement…" : "Actualiser le solde"}
              </BtnPrimary>
            )}
            {userWalletDetail && (
              <div className="rounded-xl bg-violet-50 border border-violet-100 p-4 text-sm">
                {userWalletDetail.userName && (
                  <p className="font-semibold text-[#1a1a2e]">{userWalletDetail.userName}</p>
                )}
                <p className={userWalletDetail.userName ? "mt-1" : ""}>
                  <span className="text-gray-500">Utilisateur:</span>{" "}
                  <span className="font-mono text-xs">{userWalletDetail.userId}</span>
                </p>
                <p className="mt-1 text-lg font-bold text-[#6C63FF]">
                  Solde: {formatCdf(userWalletDetail.balanceCdf ?? 0)}
                </p>
                {activeUserId && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white/80 px-3 py-2">
                      <p className="text-gray-500">Recharges</p>
                      <p className="font-semibold text-emerald-700">{rechargeCount}</p>
                    </div>
                    <div className="rounded-lg bg-white/80 px-3 py-2">
                      <p className="text-gray-500">Retraits</p>
                      <p className="font-semibold text-amber-800">{withdrawCount}</p>
                    </div>
                  </div>
                )}
                {cashDebts && cashDebts.totalOpenCdf > 0 && (
                  <p className="mt-2 text-amber-800 font-semibold">
                    Dette espèces à la plateforme : {formatCdf(cashDebts.totalOpenCdf)}
                  </p>
                )}
              </div>
            )}
          </Card>

          {!readOnly && activeUserId && (
            <>
              <Card className="p-5 space-y-4">
                <h2 className="font-semibold">Retrait Mobile Money</h2>
                <p className="text-sm text-gray-500">
                  Envoie les fonds du portefeuille vers un numéro Orange Money, M-Pesa ou Airtel Money.
                  Minimum 500 FC.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <label>
                    <FieldLabel>Montant CDF</FieldLabel>
                    <TextInput value={withdrawAmount} onChange={setWithdrawAmount} type="number" placeholder="5000" />
                  </label>
                  <label>
                    <FieldLabel>Opérateur</FieldLabel>
                    <SelectInput
                      value={withdrawProvider}
                      onChange={setWithdrawProvider}
                      options={MOBILE_MONEY_PROVIDERS}
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <FieldLabel>Numéro Mobile Money (+243…)</FieldLabel>
                    <TextInput value={withdrawPhone} onChange={setWithdrawPhone} placeholder="+243812345678" />
                  </label>
                </div>
                <BtnPrimary onClick={submitWithdraw} disabled={withdrawing || !withdrawAmount.trim()}>
                  {withdrawing ? "Retrait en cours…" : "Initier le retrait"}
                </BtnPrimary>
              </Card>

              <Card className="p-5 space-y-4">
                <h2 className="font-semibold">Ajustement manuel</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <label>
                    <FieldLabel>Montant CDF</FieldLabel>
                    <TextInput value={adjustAmount} onChange={setAdjustAmount} type="number" />
                  </label>
                  <label>
                    <FieldLabel>Type</FieldLabel>
                    <SelectInput
                      value={adjustType}
                      onChange={(v) => setAdjustType(v as "CREDIT" | "DEBIT")}
                      options={[
                        { value: "CREDIT", label: "Crédit" },
                        { value: "DEBIT", label: "Débit" },
                      ]}
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <FieldLabel>Description</FieldLabel>
                    <TextInput value={adjustDesc} onChange={setAdjustDesc} placeholder="Motif de l'ajustement" />
                  </label>
                </div>
                <BtnPrimary onClick={submitAdjust} disabled={saving}>
                  {saving ? "En cours…" : "Appliquer l'ajustement"}
                </BtnPrimary>
              </Card>
            </>
          )}

          {!readOnly && !activeUserId && (
            <Card className="p-5 text-sm text-gray-500">
              Sélectionnez un utilisateur ci-dessus pour effectuer un retrait ou un ajustement manuel.
            </Card>
          )}

          <section className="space-y-3">
            <Card className="p-5 space-y-4">
              <div>
                <h2 className="font-semibold">Seuil dette espèces chauffeurs</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Au-delà du seuil, les chauffeurs/livreurs ne reçoivent plus les notifications de courses tant que la dette n&apos;est pas réglée.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <FieldLabel>Seuil maximum (FC)</FieldLabel>
                  <TextInput
                    type="number"
                    value={debtThresholdInput}
                    onChange={(v) => setDebtThresholdInput(v)}
                    disabled={readOnly || debtPolicySaving}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={debtPolicy?.blockOffers ?? true}
                    disabled={readOnly || debtPolicySaving}
                    onChange={(e) =>
                      setDebtPolicy((p) =>
                        p ? { ...p, blockOffers: e.target.checked } : { id: "default", maxOpenDebtCdf: 50000, blockOffers: e.target.checked, isActive: true },
                      )
                    }
                  />
                  Bloquer les offres
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={debtPolicy?.isActive ?? true}
                    disabled={readOnly || debtPolicySaving}
                    onChange={(e) =>
                      setDebtPolicy((p) =>
                        p ? { ...p, isActive: e.target.checked } : { id: "default", maxOpenDebtCdf: 50000, blockOffers: true, isActive: e.target.checked },
                      )
                    }
                  />
                  Politique active
                </label>
              </div>
              {!readOnly && (
                <BtnPrimary
                  disabled={debtPolicySaving}
                  onClick={async () => {
                    setDebtPolicySaving(true);
                    try {
                      const maxOpenDebtCdf = Math.max(0, Number(debtThresholdInput) || 0);
                      const updated = await updateDebtPolicy({
                        maxOpenDebtCdf,
                        blockOffers: debtPolicy?.blockOffers ?? true,
                        isActive: debtPolicy?.isActive ?? true,
                      });
                      setDebtPolicy(updated);
                      setDebtThresholdInput(String(updated.maxOpenDebtCdf));
                    } catch (e) {
                      setError(sanitizeAdminError(e instanceof Error ? e.message : "Erreur enregistrement seuil"));
                    } finally {
                      setDebtPolicySaving(false);
                    }
                  }}
                >
                  {debtPolicySaving ? "Enregistrement…" : "Enregistrer le seuil"}
                </BtnPrimary>
              )}
            </Card>

            {!readOnly && (
              <Card className="p-5 space-y-4">
                <div>
                  <h2 className="font-semibold">Confirmer paiement espèces chauffeur</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Le chauffeur paie au guichet SENGA et affiche un code à 6 chiffres (ou QR) dans Revenus → Payer en espèces.
                  </p>
                </div>
                {cashConfirmSuccess && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {cashConfirmSuccess}
                  </div>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[12rem] flex-1">
                    <FieldLabel>Code chauffeur (6 chiffres)</FieldLabel>
                    <TextInput
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      value={cashConfirmCode}
                      onChange={(v) => setCashConfirmCode(v.replace(/\D/g, "").slice(0, 6))}
                      disabled={cashConfirmLoading}
                    />
                  </div>
                  <BtnPrimary onClick={submitConfirmCashDebt} disabled={cashConfirmLoading}>
                    {cashConfirmLoading ? "Validation…" : "Valider le paiement"}
                  </BtnPrimary>
                </div>
              </Card>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-semibold">Dettes espèces à la plateforme</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Montants dus par chauffeurs/livreurs après paiements cash (commission SENGA, parts restaurant/partenaire).
                  {activeUserId && cashDebts ? ` · ${cashDebts.openDebtCount} ligne(s) pour cet utilisateur` : ""}
                </p>
              </div>
            </div>

            {cashDebts && cashDebts.totalOpenCdf > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="p-4">
                  <p className="text-xs text-gray-500">Commission SENGA</p>
                  <p className="text-lg font-bold text-amber-700">{formatCdf(cashDebts.platformFeeCdf)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-gray-500">Parts restaurant</p>
                  <p className="text-lg font-bold text-amber-700">{formatCdf(cashDebts.restaurantShareCdf)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-gray-500">Parts partenaire</p>
                  <p className="text-lg font-bold text-amber-700">{formatCdf(cashDebts.partnerShareCdf)}</p>
                </Card>
              </div>
            )}

            {!activeUserId && cashDebts && cashDebts.debtors.length > 0 && (
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="p-3">Chauffeur / livreur</th>
                      <th className="p-3">Total dû</th>
                      <th className="p-3">Commission</th>
                      <th className="p-3">Restaurant</th>
                      <th className="p-3">Partenaire</th>
                      <th className="p-3">Lignes</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {cashDebts.debtors.map((d) => (
                      <tr key={d.driverUserId} className="border-b">
                        <td className="p-3 font-medium">{d.driverName ?? "—"}</td>
                        <td className="p-3 font-semibold text-amber-800">{formatCdf(d.totalCdf)}</td>
                        <td className="p-3">{formatCdf(d.platformFeeCdf)}</td>
                        <td className="p-3">{formatCdf(d.restaurantShareCdf)}</td>
                        <td className="p-3">{formatCdf(d.partnerShareCdf)}</td>
                        <td className="p-3">{d.openCount}</td>
                        <td className="p-3">
                          <BtnGhost
                            onClick={() => {
                              setFilterUserId(d.driverUserId);
                              setUserSearch(d.driverName ?? d.driverUserId);
                              void fetchUser(d.driverUserId)
                                .then(selectUser)
                                .catch(() => {
                                  setSelectedUser(null);
                                  void load();
                                });
                            }}
                          >
                            Voir détail
                          </BtnGhost>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Date</th>
                    <th className="p-3">Débiteur</th>
                    <th className="p-3">Catégorie</th>
                    <th className="p-3">Montant</th>
                    <th className="p-3">Référence</th>
                    <th className="p-3">Description</th>
                    {!readOnly && <th className="p-3" />}
                  </tr>
                </thead>
                <tbody>
                  {!cashDebts || cashDebts.debts.length === 0 ? (
                    <tr>
                      <td colSpan={readOnly ? 6 : 7} className="p-4 text-gray-500">
                        Aucune dette espèces ouverte{activeUserId ? " pour cet utilisateur" : ""}.
                      </td>
                    </tr>
                  ) : (
                    cashDebts.debts.map((d) => (
                      <tr key={d.id} className="border-b">
                        <td className="p-3 text-gray-500">{formatDate(d.createdAt)}</td>
                        <td className="p-3 font-medium">{d.driverName ?? d.driverUserId.slice(0, 8) + "…"}</td>
                        <td className="p-3">
                          <StatusBadge status={debtCategoryLabel(d.category)} />
                        </td>
                        <td className="p-3 font-semibold text-amber-800">{formatCdf(d.amountCdf)}</td>
                        <td className="p-3 text-xs text-gray-500">
                          {d.referenceType} · <span className="font-mono">{d.referenceId.slice(0, 8)}…</span>
                        </td>
                        <td className="p-3">{d.description ?? "—"}</td>
                        {!readOnly && (
                          <td className="p-3">
                            <BtnGhost
                              onClick={() => submitSettleDebt(d.id)}
                              disabled={settlingDebtId === d.id}
                            >
                              {settlingDebtId === d.id ? "…" : "Régler"}
                            </BtnGhost>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          </section>

          <section>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div className="flex-1 min-w-[200px]">
                <h2 className="font-semibold">Transactions récentes</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {txTotal > transactions.length
                    ? `${transactions.length} affichées sur ${txTotal}`
                    : `${transactions.length} transaction(s)`}
                  {filterLabel ? ` · Filtre : ${filterLabel}` : ""}
                </p>
              </div>
              <BtnGhost onClick={() => exportWalletTransactionsCsv(transactions, wallet, m, filterLabel, cashDebts ?? undefined)}>
                CSV
              </BtnGhost>
              <BtnGhost onClick={() => printWalletReport(transactions, wallet, m, filterLabel, cashDebts ?? undefined)}>
                Imprimer
              </BtnGhost>
              <BtnPrimary onClick={load}>Actualiser</BtnPrimary>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {([
                ["all", `Toutes (${transactions.length})`],
                ["recharge", `Recharges (${rechargeCount})`],
                ["withdraw", `Retraits (${withdrawCount})`],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTxFilter(id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    txFilter === id
                      ? "bg-[#6C63FF] text-white border-[#6C63FF]"
                      : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Date</th>
                    <th className="p-3">Nom</th>
                    <th className="p-3">Utilisateur</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Montant</th>
                    <th className="p-3">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-gray-500">
                        Aucune transaction{filterLabel ? " pour ce filtre" : ""}.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((t) => (
                      <tr key={t.id} className="border-b">
                        <td className="p-3 text-gray-500">{formatDate(t.createdAt)}</td>
                        <td className="p-3 font-medium">{t.wallet?.userName ?? "—"}</td>
                        <td className="p-3 font-mono text-xs text-gray-500">{t.wallet?.userId ?? "—"}</td>
                        <td className="p-3">
                          <StatusBadge status={t.type} />
                        </td>
                        <td className="p-3">{formatCdf(Math.abs(t.amountCdf))}</td>
                        <td className="p-3">{walletTxLabel(t)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
            {transactions.length < txTotal && (
              <div className="mt-3 flex justify-center">
                <BtnGhost onClick={loadMoreTransactions} disabled={txLoadingMore}>
                  {txLoadingMore
                    ? "Chargement…"
                    : `Charger plus (${transactions.length} / ${txTotal})`}
                </BtnGhost>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
