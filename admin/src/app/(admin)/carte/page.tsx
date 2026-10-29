"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFleetMap, MOVA_CITIES } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { BtnGhost, ErrorBanner, LoadingState, PageHeader, SelectInput } from "@/components/ui";

export default function CartePage() {
  const { role, user } = useAdmin();
  const lockedCity = role === "CITY_ADMIN" ? user?.managedCity?.trim() || "" : "";
  const [city, setCity] = useState(lockedCity);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchFleetMap>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchFleetMap(lockedCity || city || null);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur carte");
    } finally {
      setLoading(false);
    }
  }, [city, lockedCity]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      if (!mapRef.current || !data) return;
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      if (!leafletRef.current) {
        const map = L.map(mapRef.current, { scrollWheelZoom: true }).setView([-4.32, 15.31], 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
        }).addTo(map);
        leafletRef.current = { map, layer: L.layerGroup().addTo(map), L };
      }
      const { map, layer, L: LL } = leafletRef.current;
      layer.clearLayers();
      const pts: [number, number][] = [];
      for (const d of data.drivers) {
        const color = d.isAvailable ? "#10b981" : "#6b7280";
        const icon = LL.divIcon({
          className: "",
          html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        const name = [d.firstName, d.lastName].filter(Boolean).join(" ") || d.publicId || d.userId;
        LL.marker([d.lat, d.lng], { icon })
          .addTo(layer)
          .bindPopup(`<strong>${name}</strong><br/>${d.dutyStatus ?? ""} · ${d.operatingCity ?? ""}`);
        pts.push([d.lat, d.lng]);
      }
      for (const s of data.sos) {
        const icon = LL.divIcon({
          className: "",
          html: '<div style="width:16px;height:16px;border-radius:50%;background:#dc2626;border:3px solid #fff"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        LL.marker([s.lat, s.lng], { icon })
          .addTo(layer)
          .bindPopup(`<strong>SOS</strong><br/>${s.description ?? s.id ?? ""}`);
        pts.push([s.lat, s.lng]);
      }
      if (pts.length > 0) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [data]);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <PageHeader
        title="Carte flotte"
        subtitle="Chauffeurs GPS + SOS · rafraîchi toutes les 15 s"
        action={<BtnGhost onClick={() => void load()}>Actualiser</BtnGhost>}
      />
      {!lockedCity && (
        <SelectInput
          value={city}
          onChange={(v) => {
            setLoading(true);
            setCity(v);
          }}
          options={[{ value: "", label: "Toutes les villes" }, ...MOVA_CITIES.map((c) => ({ value: c, label: c }))]}
        />
      )}
      {error && <ErrorBanner message={error} onRetry={load} />}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          label="En ligne"
          value={data?.counts.online ?? "…"}
          hint="pastilles vertes"
          accent="green"
        />
        <MetricCard
          label="Avec GPS"
          value={data?.counts.totalWithGps ?? "…"}
          hint="verts + gris"
          accent="midnight"
        />
        <MetricCard label="SOS" value={data?.counts.sos ?? "…"} hint="pastilles rouges" accent="red" />
      </div>
      {loading && !data ? (
        <LoadingState />
      ) : (
        <div className="relative w-full h-[520px] rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
          <div ref={mapRef} className="absolute inset-0" />
          <div className="absolute bottom-3 left-3 z-[500] rounded-lg bg-white/95 border border-gray-200 shadow-sm px-3 py-2 text-xs text-gray-700 space-y-1.5 pointer-events-none">
            <p className="font-semibold text-[11px] uppercase tracking-wide text-gray-500">Légende</p>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-[#10b981] border-2 border-white shadow" />
              Disponible (en ligne)
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-[#6b7280] border-2 border-white shadow" />
              GPS · non disponible
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 rounded-full bg-[#dc2626] border-[3px] border-white shadow" />
              SOS ouvert
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
