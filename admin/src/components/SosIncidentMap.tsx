"use client";

import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

type Props = {
  lat: number;
  lng: number;
  label?: string;
  height?: number;
};

function fixLeafletIcons(L: typeof import("leaflet")) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function SosIncidentMap({ lat, lng, label = "Position SOS", height = 200 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    async function init() {
      if (!containerRef.current || cancelled) return;
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;
      fixLeafletIcons(L);

      const map = L.map(containerRef.current, { scrollWheelZoom: false, zoomControl: true });
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      layersRef.current = L.layerGroup().addTo(map);

      const redIcon = L.divIcon({
        className: "",
        html: '<div style="width:18px;height:18px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      L.marker([lat, lng], { icon: redIcon, title: label })
        .addTo(layersRef.current)
        .bindPopup(`<strong>${label}</strong><br/>${lat.toFixed(5)}, ${lng.toFixed(5)}`);

      map.setView([lat, lng], 16);

      const invalidate = () => map.invalidateSize({ animate: false });
      resizeObserver = new ResizeObserver(invalidate);
      resizeObserver.observe(containerRef.current);
      invalidate();
      setTimeout(invalidate, 200);
    }

    init();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, [lat, lng, label]);

  return (
    <div className="rounded-lg border border-red-200 overflow-hidden bg-white">
      <div ref={containerRef} className="w-full" style={{ height, minHeight: height }} />
    </div>
  );
}

export function SosIncidentMapPlaceholder({ height = 200 }: { height?: number }) {
  return (
    <div
      className="rounded-lg border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-xs text-gray-500"
      style={{ height, minHeight: height }}
    >
      Position GPS non disponible
    </div>
  );
}
