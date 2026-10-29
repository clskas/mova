export type PeriodPresetDays = 1 | 7 | 30 | 90;
export type PeriodMode = "preset" | "custom";

export const LIST_PERIOD_PRESETS: { days: PeriodPresetDays; label: string }[] = [
  { days: 1, label: "Auj." },
  { days: 7, label: "7j" },
  { days: 30, label: "30j" },
  { days: 90, label: "90j" },
];

export function todayYmdKinshasa(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kinshasa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function rangeForPresetDays(days: number): { from: string; to: string } {
  const to = todayYmdKinshasa();
  const end = new Date(`${to}T12:00:00+01:00`);
  end.setDate(end.getDate() - (Math.max(1, days) - 1));
  const from = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kinshasa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(end);
  return { from, to };
}
