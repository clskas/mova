"use client";

import { useEffect, useState } from "react";
import type { GeoSuggestion } from "./api";

export const RDC_BOUNDS = { minLat: -13.6, maxLat: 5.6, minLng: 12.0, maxLng: 31.5 };

export type DrcPoint = { lat: number; lng: number };

export const GPS_OR_SUGGESTION_FR =
  "Activez le GPS (position en RDC) ou choisissez une adresse dans les suggestions SENGA.";

export function isInDrcTerritory(lat: number, lng: number): boolean {
  return (
    lat >= RDC_BOUNDS.minLat &&
    lat <= RDC_BOUNDS.maxLat &&
    lng >= RDC_BOUNDS.minLng &&
    lng <= RDC_BOUNDS.maxLng
  );
}

export function getBrowserDrcLocation(): Promise<DrcPoint | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        resolve(isInDrcTerritory(lat, lng) ? { lat, lng } : null);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export function suggestionPoint(s: GeoSuggestion): DrcPoint | null {
  if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return null;
  return isInDrcTerritory(s.lat, s.lng) ? { lat: s.lat, lng: s.lng } : null;
}

export function useDrcPickup() {
  const [pickup, setPickup] = useState<DrcPoint | null>(null);
  useEffect(() => {
    void getBrowserDrcLocation().then(setPickup);
  }, []);
  return { pickup, setPickup };
}
