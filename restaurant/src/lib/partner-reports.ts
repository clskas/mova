import { formatCdf } from "./api";

export type PartnerEarningsReport = {
  partnerType: string;
  partnerName: string;
  balanceCdf: number;
  formattedBalance: string;
  walletAvailable?: boolean;
  walletMessage?: string;
  periodTotalCdf: number;
  periodCount: number;
  from: string | null;
  to: string | null;
  data: {
    id: string;
    amountCdf: number;
    description?: string;
    reference?: string;
    createdAt: string;
  }[];
  pagination: { skip: number; take: number; total: number };
};

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-CD");
}

export function exportPartnerReportCsv(report: PartnerEarningsReport, filenamePrefix: string) {
  const lines = [
    "SENGA — Rapport financier partenaire",
    `Partenaire;${report.partnerName.replace(/;/g, ",")}`,
    `Généré;${new Date().toISOString()}`,
    report.from ? `Du;${report.from}` : "",
    report.to ? `Au;${report.to}` : "",
    "",
    `Solde actuel;${report.balanceCdf}`,
    `Total période;${report.periodTotalCdf}`,
    `Nombre d'opérations;${report.periodCount}`,
    "",
    "Date;Montant FC;Référence;Description",
    ...report.data.map((row) =>
      [row.createdAt, row.amountCdf, (row.reference ?? "").replace(/;/g, ","), (row.description ?? "").replace(/;/g, ",")].join(";"),
    ),
  ];
  const blob = new Blob([lines.filter(Boolean).join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printPartnerReport(report: PartnerEarningsReport, title: string) {
  const rows = report.data
    .map(
      (row) => `<tr>
        <td>${formatDate(row.createdAt)}</td>
        <td style="text-align:right">${formatCdf(row.amountCdf)}</td>
        <td style="font-family:monospace;font-size:11px">${escapeHtml(row.reference ?? "—")}</td>
        <td>${escapeHtml(row.description ?? "—")}</td>
      </tr>`,
    )
    .join("");
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:24px;color:#1a1a2e}
    h1{font-size:20px;color:#6C63FF;margin:0 0 4px}
    .meta{color:#666;font-size:13px;margin-bottom:20px}
    .kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px}
    .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:12px}
    .kpi label{display:block;font-size:12px;color:#666}
    .kpi strong{font-size:18px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #e5e7eb;padding:8px;text-align:left}
    th{background:#f9fafb}
    @media print{body{margin:12px}}
  </style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${escapeHtml(report.partnerName)} · Généré le ${new Date().toLocaleString("fr-CD")}</p>
  <div class="kpis">
    <div class="kpi"><label>Solde actuel</label><strong>${formatCdf(report.balanceCdf)}</strong></div>
    <div class="kpi"><label>Total période</label><strong>${formatCdf(report.periodTotalCdf)}</strong></div>
    <div class="kpi"><label>Opérations</label><strong>${report.periodCount}</strong></div>
  </div>
  <table><thead><tr><th>Date</th><th>Montant</th><th>Référence</th><th>Description</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4">Aucune opération</td></tr>'}</tbody></table>
  <script>window.onload=()=>window.print()</script>
  </body></html>`;
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function downloadPartnerReportPdf(
  apiBase: string,
  path: string,
  authHeaders: () => Record<string, string>,
  filenamePrefix: string,
  params?: Record<string, string>,
) {
  const q = params ? `?${new URLSearchParams(params).toString()}` : "";
  const res = await fetch(`${apiBase}${path}${q}`, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: { message?: string } })?.error?.message ?? `Erreur ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
