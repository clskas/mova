"use client";

import { useState } from "react";
import { uploadVehiclePhoto } from "@/lib/api";
import { ImageSourcePicker } from "@/components/ImageSourcePicker";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

type Props = {
  value?: string | null;
  onChange: (url: string | null) => void;
  onError?: (message: string) => void;
  label?: string;
  disabled?: boolean;
};

export function VehiclePhotoUpload({
  value,
  onChange,
  onError,
  label = "Photo du véhicule",
  disabled = false,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const preview = resolveMediaUrl(value);

  async function handleFile(file: File | null) {
    if (!file || disabled) return;
    setUploading(true);
    try {
      const url = await uploadVehiclePhoto(file);
      onChange(url);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Échec envoi photo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {preview ? (
        <img src={preview} alt="Véhicule" className="w-full max-h-48 object-cover rounded-xl border" />
      ) : (
        <div className="h-32 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
          Aucune photo
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <ImageSourcePicker
          disabled={disabled || uploading}
          onSelect={handleFile}
          label={uploading ? "Envoi…" : preview ? "Changer la photo" : "Prendre / choisir une photo"}
        />
        {preview && !disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="px-3 py-2 rounded-lg border text-sm text-gray-600"
          >
            Retirer
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500">JPG, PNG ou WebP — max 5 Mo. Caméra ou galerie.</p>
    </div>
  );
}
