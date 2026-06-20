"use client";

import Link from "next/link";

type MetricCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  accent?: "violet" | "green" | "orange" | "red" | "midnight";
  sparkline?: number[];
  onClick?: () => void;
  active?: boolean;
};

const ACCENTS = {
  violet: "from-[#6366f1] to-[#8b5cf6]",
  green: "from-[#10b981] to-[#34d399]",
  orange: "from-[#f97316] to-[#fb923c]",
  red: "from-[#ef4444] to-[#f87171]",
  midnight: "from-[#0d0d1a] to-[#2d2b55]",
};

export function MetricCard({ label, value, hint, href, accent = "violet", sparkline, onClick, active }: MetricCardProps) {
  const inner = (
    <div
      className={`mova-card p-4 h-full transition-all cursor-pointer hover:shadow-mova ${
        active ? "ring-2 ring-[#6366f1]/40 shadow-mova" : ""
      }`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <div className={`w-2 h-2 rounded-full bg-gradient-to-br ${ACCENTS[accent]} shrink-0 mt-0.5`} />
      </div>
      <p className="text-2xl font-bold text-[#0d0d1a] mt-2 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {sparkline && sparkline.length > 1 && (
        <svg viewBox={`0 0 ${sparkline.length - 1} 24`} className="w-full h-8 mt-3" preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke="#6366f1"
            strokeWidth="0.15"
            strokeLinejoin="round"
            points={sparkline
              .map((v, i) => {
                const max = Math.max(...sparkline, 1);
                const y = 24 - (v / max) * 22 - 1;
                return `${i},${y}`;
              })
              .join(" ")}
          />
        </svg>
      )}
    </div>
  );

  if (href) return <Link href={href} className="block h-full">{inner}</Link>;
  return inner;
}
