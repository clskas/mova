"use client";

type BarChartProps = {
  data: { label: string; value: number }[];
  valueFormatter?: (n: number) => string;
  color?: string;
  height?: number;
};

export function BarChart({ data, valueFormatter, color = "#6366f1", height = 160 }: BarChartProps) {
  if (!data.length) {
    return <p className="text-sm text-gray-400 text-center py-8">Aucune donnée sur la période</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const fmt = valueFormatter ?? ((n: number) => String(n));

  return (
    <div className="flex items-end gap-1 sm:gap-2" style={{ height }}>
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={d.label} className="flex-1 min-w-0 flex flex-col items-center gap-1 group">
            <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
              {fmt(d.value)}
            </span>
            <div className="w-full flex items-end" style={{ height: height - 28 }}>
              <div
                className="w-full rounded-t-md transition-all duration-300 hover:opacity-80"
                style={{ height: `${Math.max(pct, d.value > 0 ? 4 : 0)}%`, backgroundColor: color }}
                title={`${d.label}: ${fmt(d.value)}`}
              />
            </div>
            <span className="text-[9px] sm:text-[10px] text-gray-500 truncate w-full text-center">
              {d.label.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
