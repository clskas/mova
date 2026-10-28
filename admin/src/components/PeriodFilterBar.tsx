"use client";

import {
  LIST_PERIOD_PRESETS,
  todayYmdKinshasa,
  type PeriodMode,
  type PeriodPresetDays,
} from "@/lib/period-filter";

type Props = {
  mode: PeriodMode;
  period: PeriodPresetDays;
  customFrom: string;
  customTo: string;
  appliedFrom: string | null;
  appliedTo: string | null;
  onModeChange: (mode: PeriodMode) => void;
  onPeriodChange: (days: PeriodPresetDays) => void;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  onApplyCustom: () => void;
  /** Compact label above the control (default: Période). */
  label?: string;
};

/**
 * Period filter for list pages. Default mode `all` = no date filter.
 * Presets (Auj./7j/30j/90j) and Perso apply createdAt bounds.
 */
export function PeriodFilterBar({
  mode,
  period,
  customFrom,
  customTo,
  appliedFrom,
  appliedTo,
  onModeChange,
  onPeriodChange,
  onCustomFromChange,
  onCustomToChange,
  onApplyCustom,
  label = "Période (inscription)",
}: Props) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-gray-500 px-0.5">{label}</span>
      <div className="flex flex-wrap items-end gap-1">
        <button
          type="button"
          onClick={() => onModeChange("all")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            mode === "all"
              ? "bg-[#6366f1] text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Tous
        </button>
        {LIST_PERIOD_PRESETS.map(({ days, label: presetLabel }) => (
          <button
            key={days}
            type="button"
            onClick={() => {
              onModeChange("preset");
              onPeriodChange(days);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === "preset" && period === days
                ? "bg-[#6366f1] text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {presetLabel}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onModeChange("custom")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            mode === "custom"
              ? "bg-[#6366f1] text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Perso
        </button>
        {mode === "custom" && (
          <div className="flex flex-wrap items-end gap-2 ml-1">
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-gray-500 px-0.5">Du</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || todayYmdKinshasa()}
                onChange={(e) => onCustomFromChange(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-gray-500 px-0.5">Au</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                max={todayYmdKinshasa()}
                onChange={(e) => onCustomToChange(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700"
              />
            </label>
            <button
              type="button"
              onClick={onApplyCustom}
              disabled={!customFrom || !customTo || customFrom > customTo}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[#1A1A2E] text-white hover:bg-[#2d2b55] disabled:opacity-40"
            >
              Appliquer
            </button>
            {appliedFrom && appliedTo && (
              <span className="text-xs text-gray-500 self-center pb-1">
                {appliedFrom} → {appliedTo}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
