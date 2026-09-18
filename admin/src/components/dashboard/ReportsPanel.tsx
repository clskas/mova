"use client";

import type { AdminReports } from "@/lib/api";
import { formatCdf } from "@/lib/api";
import { Card } from "@/components/ui";

type ReportsPanelProps = {
  reports: AdminReports | null;
  onExport: () => void;
};

function pct(n: number) {
  return `${Math.round(n * 1000) / 10} %`;
}

export function ReportsPanel({ reports, onExport }: ReportsPanelProps) {
  if (!reports) return null;
  const { kpis, serviceBreakdown, periodDays, commissionsByCity, city } = reports;

  const rows = [
    { label: "Taux de complétion courses", value: pct(kpis.completionRate), desc: "Courses terminées / demandées" },
    { label: "Taux d'annulation", value: pct(kpis.cancelRate), desc: "Courses annulées / demandées" },
    { label: "Panier moyen course", value: formatCdf(kpis.avgTicketCdf), desc: "Revenu moyen par course complétée" },
    { label: "Revenus courses (période)", value: formatCdf(kpis.totalRevenueCdf), desc: `${periodDays} derniers jours` },
    { label: "Revenus livraisons (période)", value: formatCdf(kpis.deliveryRevenueCdf), desc: "Colis, repas, express, courses" },
    { label: "Commissions SENGA (période)", value: formatCdf(kpis.totalPlatformCommissionCdf ?? 0), desc: "Parts plateforme estimées" },
    { label: "Volume livraisons", value: String(kpis.totalDeliveries), desc: "Livraisons + commissions sur période" },
  ];

  const services = [
    { name: "Courses taxi", count: serviceBreakdown.rides },
    { name: "Livraisons colis/repas", count: serviceBreakdown.deliveries },
    { name: "Commissions (ERRAND)", count: serviceBreakdown.errands },
    { name: "Repas", count: serviceBreakdown.food },
    { name: "Colis", count: serviceBreakdown.parcel },
    { name: "Express", count: serviceBreakdown.express },
    { name: "Déménagements", count: serviceBreakdown.moving },
    { name: "Réservations planifiées", count: serviceBreakdown.scheduled },
    { name: "Covoiturage", count: serviceBreakdown.carpool },
  ].filter((s) => s.count > 0);

  const maxService = Math.max(...services.map((s) => s.count), 1);
  const cityRows = commissionsByCity ?? [];

  return (
    <Card className="p-5 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#0d0d1a]">Rapports avancés</h2>
          <p className="text-sm text-gray-500">
            KPIs opérationnels et financiers — {periodDays} jours
            {city ? ` · ${city}` : " · toutes villes"}
          </p>
        </div>
        <button type="button" onClick={onExport} className="mova-btn-primary text-sm">
          Exporter CSV
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl border border-[var(--mova-border)] p-3 bg-[#fafaff]">
            <p className="text-xs text-gray-500">{r.label}</p>
            <p className="text-xl font-bold text-[#0d0d1a] mt-1 tabular-nums">{r.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{r.desc}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Commissions SENGA par ville</h3>
        {cityRows.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune commission sur la période</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--mova-border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[#f8f8fc] text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Ville</th>
                  <th className="px-3 py-2 font-medium">Courses</th>
                  <th className="px-3 py-2 font-medium">Livraisons</th>
                  <th className="px-3 py-2 font-medium">Repas</th>
                  <th className="px-3 py-2 font-medium">Total commission</th>
                  <th className="px-3 py-2 font-medium">Vol.</th>
                </tr>
              </thead>
              <tbody>
                {cityRows.map((row) => (
                  <tr key={row.city} className="border-t border-[var(--mova-border)]">
                    <td className="px-3 py-2 font-medium text-[#0d0d1a]">{row.city}</td>
                    <td className="px-3 py-2 tabular-nums">{formatCdf(row.ridesCdf)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatCdf(row.deliveriesCdf)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatCdf(row.foodCdf)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{formatCdf(row.totalCdf)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-500">
                      {row.rides + row.deliveries}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Répartition par service</h3>
        <div className="space-y-2">
          {services.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune activité enregistrée</p>
          ) : (
            services.map((s) => (
              <div key={s.name} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-36 shrink-0 truncate">{s.name}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded-full transition-all"
                    style={{ width: `${(s.count / maxService) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums w-8 text-right">{s.count}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}
