"use client";

import { useMemo } from "react";

export type GpsPoint = { lat: number; lng: number; recordedAt?: string };

type MapMarker = { lat: number; lng: number; label: string; color: string };

type Props = {
  points?: GpsPoint[];
  pickup?: { lat: number; lng: number } | null;
  dropoff?: { lat: number; lng: number } | null;
  height?: number;
  title?: string;
  live?: boolean;
};

function collectBounds(markers: MapMarker[], points: GpsPoint[]) {
  const all = [
    ...markers.map((m) => ({ lat: m.lat, lng: m.lng })),
    ...points.map((p) => ({ lat: p.lat, lng: p.lng })),
  ];
  if (all.length === 0) {
    return { minLat: -4.35, maxLat: -4.3, minLng: 15.28, maxLng: 15.32 };
  }
  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const pad = 0.004;
  return {
    minLat: Math.min(...lats) - pad,
    maxLat: Math.max(...lats) + pad,
    minLng: Math.min(...lngs) - pad,
    maxLng: Math.max(...lngs) + pad,
  };
}

function project(
  lat: number,
  lng: number,
  bounds: ReturnType<typeof collectBounds>,
  width: number,
  height: number,
) {
  const lngSpan = bounds.maxLng - bounds.minLng || 0.001;
  const latSpan = bounds.maxLat - bounds.minLat || 0.001;
  const x = ((lng - bounds.minLng) / lngSpan) * width;
  const y = height - ((lat - bounds.minLat) / latSpan) * height;
  return { x, y };
}

export function GpsTraceMap({
  points = [],
  pickup,
  dropoff,
  height = 220,
  title = "Trace GPS",
  live = false,
}: Props) {
  const width = 640;
  const markers: MapMarker[] = [];
  if (pickup) markers.push({ lat: pickup.lat, lng: pickup.lng, label: "D", color: "#22c55e" });
  if (dropoff) markers.push({ lat: dropoff.lat, lng: dropoff.lng, label: "A", color: "#6C63FF" });

  const bounds = useMemo(() => collectBounds(markers, points), [markers, points]);
  const polyline = useMemo(() => {
    if (points.length < 2) return "";
    return points
      .map((p) => {
        const { x, y } = project(p.lat, p.lng, bounds, width, height);
        return `${x},${y}`;
      })
      .join(" ");
  }, [points, bounds, height]);

  const lastPoint = points.length > 0 ? points[points.length - 1] : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-slate-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
        <p className="text-sm font-medium text-gray-700">{title}</p>
        <span className="text-xs text-gray-500">
          {points.length} point{points.length > 1 ? "s" : ""}
          {live ? " · live" : ""}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full bg-[#e8eef4]" style={{ height }}>
        <rect x="0" y="0" width={width} height={height} fill="#e8eef4" />
        {polyline && (
          <polyline
            points={polyline}
            fill="none"
            stroke="#6C63FF"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
        )}
        {points.length === 1 && (() => {
          const { x, y } = project(points[0].lat, points[0].lng, bounds, width, height);
          return <circle cx={x} cy={y} r="5" fill="#6C63FF" />;
        })()}
        {lastPoint && points.length > 1 && (() => {
          const { x, y } = project(lastPoint.lat, lastPoint.lng, bounds, width, height);
          return (
            <>
              <circle cx={x} cy={y} r="10" fill="#6C63FF" opacity="0.2" />
              <circle cx={x} cy={y} r="6" fill="#1e1b4b" stroke="#fff" strokeWidth="2" />
            </>
          );
        })()}
        {markers.map((m) => {
          const { x, y } = project(m.lat, m.lng, bounds, width, height);
          return (
            <g key={`${m.label}-${m.lat}`}>
              <circle cx={x} cy={y} r="11" fill={m.color} stroke="#fff" strokeWidth="2" />
              <text x={x} y={y + 4} textAnchor="middle" fontSize="10" fill="#fff" fontWeight="700">
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
      {points.length === 0 && (
        <p className="text-xs text-gray-500 px-3 py-2 border-t border-gray-200">
          Aucun point GPS enregistré pour le moment. La trace apparaît quand le chauffeur/coursier est en mission.
        </p>
      )}
    </div>
  );
}
