"use client";

const COLORS = ["#6366f1", "#10b981", "#f97316", "#8b5cf6", "#ef4444", "#64748b"];

const VEHICLE_LABELS: Record<string, string> = {
  MOTO_TAXI: "Moto-taxi",
  STANDARD: "Standard",
  COMFORT: "Confort",
  VIP: "VIP",
};

type DonutChartProps = {
  data: Record<string, number>;
  size?: number;
};

export function DonutChart({ data, size = 140 }: DonutChartProps) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return <p className="text-sm text-gray-400">—</p>;

  let cumulative = 0;
  const gradient = entries
    .map(([, value], i) => {
      const start = (cumulative / total) * 100;
      cumulative += value;
      const end = (cumulative / total) * 100;
      return `${COLORS[i % COLORS.length]} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div
        className="rounded-full shrink-0"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${gradient})`,
          mask: "radial-gradient(circle, transparent 55%, black 56%)",
          WebkitMask: "radial-gradient(circle, transparent 55%, black 56%)",
        }}
      />
      <ul className="text-xs space-y-1.5 flex-1">
        {entries.map(([key, value], i) => (
          <li key={key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="truncate">{VEHICLE_LABELS[key] ?? key}</span>
            </span>
            <span className="font-medium tabular-nums shrink-0">
              {value} ({Math.round((value / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
