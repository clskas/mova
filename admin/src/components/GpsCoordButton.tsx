"use client";

import { useState } from "react";

type GpsCoordButtonProps = {
  onCoords: (lat: string, lng: string) => void;
  onError?: (message: string) => void;
  className?: string;
  label?: string;
};

function geolocationErrorMessage(err: GeolocationPositionError): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "La géolocalisation nécessite HTTPS ou localhost (pas une IP http://).";
  }
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Accès à la localisation refusé. Autorisez la localisation pour ce site dans le navigateur.";
    case err.POSITION_UNAVAILABLE:
      return "Position GPS indisponible. Vérifiez que la localisation appareil est activée.";
    case err.TIMEOUT:
      return "Délai dépassé pour obtenir la position GPS. Réessayez près d'une fenêtre ou avec le Wi‑Fi.";
    default:
      return "Impossible d'obtenir la position GPS.";
  }
}

export function GpsCoordButton({
  onCoords,
  onError,
  className,
  label = "Capturer position GPS",
}: GpsCoordButtonProps) {
  const [locating, setLocating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function fail(message: string) {
    setLocalError(message);
    onError?.(message);
    setLocating(false);
  }

  function capture() {
    setLocalError(null);
    if (!navigator.geolocation) {
      fail("Géolocalisation non disponible sur cet appareil.");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      fail("La géolocalisation nécessite HTTPS ou localhost (pas une IP http://).");
      return;
    }

    setLocating(true);

    const onSuccess = (pos: GeolocationPosition) => {
      onCoords(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6));
      setLocalError(null);
      setLocating(false);
    };

    const tryLowAccuracy = (firstErr: GeolocationPositionError) => {
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => fail(geolocationErrorMessage(err.code ? err : firstErr)),
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 },
      );
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        // Desktop / indoor: high-accuracy often times out — retry once without GPS chip.
        if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
          tryLowAccuracy(err);
          return;
        }
        fail(geolocationErrorMessage(err));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  return (
    <div className="space-y-1.5">
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
      {localError && <p className="text-xs text-red-600">{localError}</p>}
    </div>
  );
}
