import {
  formatCdf,
  formatDate,
  type AdminMetrics,
  type CashDebtsOverview,
  type WalletOverview,
  type WalletTransaction,
  normalizeMetrics,
} from "./api";

const DEBT_CATEGORY_LABELS: Record<string, string> = {
  PLATFORM_FEE: "Commission MOVA",
  RESTAURANT_SHARE: "Part restaurant",
  PARTNER_SHARE: "Part partenaire",
};

export function exportWalletTransactionsCsv(
  transactions: WalletTransaction[],
  wallet: WalletOverview,
  metrics: ReturnType<typeof normalizeMetrics>,
  filterLabel?: string,
  cashDebts?: CashDebtsOverview,
) {
  const lines = [
    "MOVA — Rapport portefeuille",
    `Généré;${new Date().toISOString()}`,
    filterLabel ? `Filtre;${filterLabel}` : "",
    "",
    "Indicateur;Valeur",
    `Revenus du jour;${metrics.revenueTodayCdf}`,
    `Solde agrégé wallets;${wallet.totalBalanceCdf ?? 0}`,
    `Paiements en attente;${wallet.pendingPayoutsCdf ?? 0}`,
    `Dettes espèces ouvertes;${cashDebts?.totalOpenCdf ?? 0}`,
    `Débiteurs espèces;${cashDebts?.debtorCount ?? 0}`,
    `Transactions aujourd'hui;${wallet.transactionsToday ?? 0}`,
    "",
    "Date;Nom;Utilisateur;Type;Montant FC;Description",
    ...transactions.map((t) =>
      [
        formatDate(t.createdAt),
        t.wallet?.userName ?? "",
        t.wallet?.userId ?? "",
        t.type,
        Math.abs(t.amountCdf ?? 0),
        (t.description ?? "").replace(/;/g, ","),
      ].join(";"),
    ),
  ];

  if (cashDebts && cashDebts.debts.length > 0) {
    lines.push(
      "",
      "Dettes espèces — Date;Débiteur;Catégorie;Montant FC;Référence;Description",
      ...cashDebts.debts.map((d) =>
        [
          formatDate(d.createdAt),
          d.driverName ?? d.driverUserId,
          DEBT_CATEGORY_LABELS[d.category] ?? d.category,
          d.amountCdf,
          `${d.referenceType}:${d.referenceId}`,
          (d.description ?? "").replace(/;/g, ","),
        ].join(";"),
      ),
    );
  }

  const blob = new Blob([lines.filter(Boolean).join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mova-portefeuille-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printWalletReport(
  transactions: WalletTransaction[],
  wallet: WalletOverview,
  metrics: ReturnType<typeof normalizeMetrics>,
  filterLabel?: string,
  cashDebts?: CashDebtsOverview,
) {
  const rows = transactions
    .map(
      (t) => `<tr>
        <td>${formatDate(t.createdAt)}</td>
        <td>${escapeHtml(t.wallet?.userName ?? "—")}</td>
        <td style="font-family:monospace;font-size:11px">${escapeHtml(t.wallet?.userId ?? "—")}</td>
        <td>${escapeHtml(t.type)}</td>
        <td style="text-align:right">${formatCdf(Math.abs(t.amountCdf ?? 0))}</td>
        <td>${escapeHtml(t.description ?? "—")}</td>
      </tr>`,
    )
    .join("");

  const debtRows = (cashDebts?.debts ?? [])
    .map(
      (d) => `<tr>
        <td>${formatDate(d.createdAt)}</td>
        <td>${escapeHtml(d.driverName ?? d.driverUserId)}</td>
        <td>${escapeHtml(DEBT_CATEGORY_LABELS[d.category] ?? d.category)}</td>
        <td style="text-align:right">${formatCdf(d.amountCdf)}</td>
        <td style="font-size:11px">${escapeHtml(`${d.referenceType} · ${d.referenceId}`)}</td>
        <td>${escapeHtml(d.description ?? "—")}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>MOVA — Rapport portefeuille</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #1a1a2e; }
    h1 { font-size: 20px; margin: 0 0 4px; color: #6C63FF; }
    h2 { font-size: 16px; margin: 24px 0 8px; }
    .meta { color: #666; font-size: 13px; margin-bottom: 20px; }
    .kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
    .kpi label { display: block; font-size: 12px; color: #666; }
    .kpi strong { font-size: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
    th { background: #f9fafb; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>MOVA — Rapport portefeuille</h1>
  <p class="meta">Généré le ${new Date().toLocaleString("fr-CD")}${filterLabel ? ` · Filtre : ${escapeHtml(filterLabel)}` : ""}</p>
  <div class="kpis">
    <div class="kpi"><label>Revenus du jour</label><strong>${formatCdf(metrics.revenueTodayCdf)}</strong></div>
    <div class="kpi"><label>Solde agrégé</label><strong>${formatCdf(wallet.totalBalanceCdf ?? 0)}</strong></div>
    <div class="kpi"><label>Paiements en attente</label><strong>${formatCdf(wallet.pendingPayoutsCdf ?? 0)}</strong></div>
    <div class="kpi"><label>Dettes espèces ouvertes</label><strong>${formatCdf(cashDebts?.totalOpenCdf ?? 0)}</strong></div>
    <div class="kpi"><label>Débiteurs espèces</label><strong>${cashDebts?.debtorCount ?? 0}</strong></div>
    <div class="kpi"><label>Transactions aujourd'hui</label><strong>${wallet.transactionsToday ?? 0}</strong></div>
  </div>
  <h2>Transactions</h2>
  <table>
    <thead>
      <tr><th>Date</th><th>Nom</th><th>Utilisateur</th><th>Type</th><th>Montant</th><th>Description</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="6">Aucune transaction</td></tr>'}</tbody>
  </table>
  ${cashDebts && cashDebts.debts.length > 0 ? `<h2>Dettes espèces ouvertes</h2>
  <table>
    <thead>
      <tr><th>Date</th><th>Débiteur</th><th>Catégorie</th><th>Montant</th><th>Référence</th><th>Description</th></tr>
    </thead>
    <tbody>${debtRows}</tbody>
  </table>` : ""}
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
