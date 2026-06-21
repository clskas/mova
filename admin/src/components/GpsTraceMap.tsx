"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LatLngExpression } from "leaflet";

export type GpsPoint = { lat: number; lng: number; recordedAt?: string };

type Props = {
  points?: GpsPoint[];
  pickup?: { lat: number; lng: number } | null;
  dropoff?: { lat: number; lng: number } | null;
  pickupLabel?: string;
  dropoffLabel?: string;
  height?: number;
  title?: string;
  live?: boolean;
};

const KINSHASA: LatLngExpression = [-4.3217, 15.3125];

function shortMapLabel(text: string | undefined, fallback: string, max = 36): string {
  const t = text?.trim() ?? "";
  if (!t) return fallback;
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fixLeafletIcons(L: typeof import("leaflet")) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export function GpsTraceMap({
  points = [],
  pickup,
  dropoff,
  pickupLabel,
  dropoffLabel,
  height = 280,
  title = "Trace GPS",
  live = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!containerRef.current || cancelled) return;

      const L = await import("leaflet");
      fixLeafletIcons(L);

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        zoomControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const latLngs: LatLngExpression[] = points.map((p) => [p.lat, p.lng]);

      if (pickup) {
        const label = shortMapLabel(pickupLabel, "Départ");
        L.marker([pickup.lat, pickup.lng], { title: label })
          .addTo(map)
          .bindPopup(`<strong>Départ</strong><br/>${escapeHtml(label)}`)
          .bindTooltip(label, {
            permanent: true,
            direction: "top",
            offset: [0, -28],
            className: "mova-map-marker-label",
          });
        latLngs.push([pickup.lat, pickup.lng]);
      }

      if (dropoff) {
        const label = shortMapLabel(dropoffLabel, "Arrivée");
        L.marker([dropoff.lat, dropoff.lng], { title: label })
          .addTo(map)
          .bindPopup(`<strong>Arrivée</strong><br/>${escapeHtml(label)}`)
          .bindTooltip(label, {
            permanent: true,
            direction: "top",
            offset: [0, -28],
            className: "mova-map-marker-label",
          });
        latLngs.push([dropoff.lat, dropoff.lng]);
      }

      if (points.length >= 2) {
        L.polyline(
          points.map((p) => [p.lat, p.lng] as LatLngExpression),
          { color: "#6366f1", weight: 5, opacity: 0.85 },
        ).addTo(map);
      } else if (points.length === 1) {
        L.circleMarker([points[0].lat, points[0].lng], {
          radius: 8,
          color: "#6366f1",
          fillColor: "#6366f1",
          fillOpacity: 0.9,
        }).addTo(map);
      }

      const boundsPoints: LatLngExpression[] = [
        ...points.map((p) => [p.lat, p.lng] as LatLngExpression),
        ...(pickup ? ([[pickup.lat, pickup.lng]] as LatLngExpression[]) : []),
        ...(dropoff ? ([[dropoff.lat, dropoff.lng]] as LatLngExpression[]) : []),
      ];

      if (boundsPoints.length >= 2) {
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [32, 32] });
      } else if (boundsPoints.length === 1) {
        map.setView(boundsPoints[0], 15);
      } else {
        map.setView(KINSHASA, 12);
      }

      setTimeout(() => map.invalidateSize(), 100);
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [points, pickup, dropoff, pickupLabel, dropoffLabel]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-slate-50">
        <p className="text-sm font-medium text-gray-700">{title}</p>
        <span className="text-xs text-gray-500">
          {points.length} point{points.length > 1 ? "s" : ""}
          {live ? " · live" : ""}
        </span>
      </div>
      <div ref={containerRef} className="w-full z-0" style={{ height, minHeight: height }} />
      {points.length === 0 && !pickup && !dropoff && (
        <p className="text-xs text-gray-500 px-3 py-2 border-t border-gray-200 bg-amber-50">
          Aucun point GPS enregistré. La carte s&apos;affiche dès qu&apos;une mission est active ou que le chauffeur se déplace.
        </p>
      )}
    </div>
  );
}
