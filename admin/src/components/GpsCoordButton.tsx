"use client";

import { useState } from "react";

type GpsCoordButtonProps = {
  onCoords: (lat: string, lng: string) => void;
  onError?: (message: string) => void;
  className?: string;
  label?: string;
};

export function GpsCoordButton({
  onCoords,
  onError,
  className,
  label = "Capturer position GPS",
}: GpsCoordButtonProps) {
  const [locating, setLocating] = useState(false);

  function capture() {
    if (!navigator.geolocation) {
      onError?.("Géolocalisation non disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onCoords(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        onError?.("Impossible d'obtenir la position GPS. Autorisez l'accès à la localisation.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <button
      type="button"
      disabled={locating}
      onClick={capture}
      className={
        className ??
        "w-full py-2 rounded-xl border border-[#6C63FF]/30 text-[#6C63FF] text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2 hover:bg-[#6C63FF]/5"
      }
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 21s7-4.35 7-10a7 7 0 10-14 0c0 5.65 7 10 7 10z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      </svg>
      {locating ? "Localisation…" : label}
    </button>
  );
}
