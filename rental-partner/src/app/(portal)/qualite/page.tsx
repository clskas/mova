"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchQuality, formatCdf } from "@/lib/api";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { rangeForPresetDays, todayYmdKinshasa, type PeriodMode, type PeriodPresetDays } from "@/lib/period-filter";

export default function QualitePage() {
  const [periodMode, setPeriodMode] = useState<PeriodMode>("preset");
  const [period, setPeriod] = useState<PeriodPresetDays>(30);
  const [customFrom, setCustomFrom] = useState(() => rangeForPresetDays(30).from);
  const [customTo, setCustomTo] = useState(todayYmdKinshasa);
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null);
  const [appliedTo, setAppliedTo] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchQuality>> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const opts =
        periodMode === "custom" && appliedFrom && appliedTo
          ? { from: appliedFrom, to: appliedTo }
          : { days: period };
      setData(await fetchQuality(opts));
    } finally {
      setLoading(false);
    }
  }, [periodMode, period, appliedFrom, appliedTo]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold text-[#1A1A2E]">Qualité / SLA</h2>
        <p className="text-sm text-gray-500 mt-1">Délais de confirmation, taux et alertes.</p>
      </div>
      <PeriodFilterBar
        mode={periodMode}
        period={period}
        customFrom={customFrom}
        customTo={customTo}
        appliedFrom={appliedFrom}
        appliedTo={appliedTo}
        onModeChange={(m) => {
          setPeriodMode(m);
          if (m !== "custom") {
            setAppliedFrom(null);
            setAppliedTo(null);
          }
        }}
        onPeriodChange={setPeriod}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onApplyCustom={() => {
          if (!customFrom || !customTo || customFrom > customTo) return;
          setAppliedFrom(customFrom);
          setAppliedTo(customTo);
          setPeriodMode("custom");
        }}
      />
      {loading && <p className="text-sm text-gray-500">Chargement…</p>}
      {data?.sla?.alert && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Seuils SLA dépassés — vérifiez les réservations en attente.
        </div>
      )}
      {data && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Confirm. moy.</p>
            <p className="text-xl font-semibold mt-1">
              {data.sla.avgConfirmHours != null ? `${data.sla.avgConfirmHours} h` : "—"}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Taux confirm.</p>
            <p className="text-xl font-semibold mt-1">
              {data.sla.confirmRate != null ? `${data.sla.confirmRate}%` : "—"}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">En attente</p>
            <p className="text-xl font-semibold mt-1">{data.sla.pending}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">No-show / closés</p>
            <p className="text-xl font-semibold mt-1">{data.sla.noShows}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 sm:col-span-2">
            <p className="text-xs text-gray-500 uppercase">CA période</p>
            <p className="text-xl font-semibold mt-1">{formatCdf(Number(data.kpis.revenueCdf) || 0)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
