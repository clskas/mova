"use client";

import { useRef, useState } from "react";
import { mediaUrl, uploadVehiclePhoto } from "@/lib/api";

type Props = {
  value?: string | null;
  onChange: (url: string | null) => void;
  onError?: (message: string) => void;
};

export function VehiclePhotoUpload({ value, onChange, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const preview = mediaUrl(value);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadVehiclePhoto(file);
      onChange(url);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Échec envoi photo");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Photo du véhicule</p>
      {preview ? (
        <img src={preview} alt="Véhicule" className="w-full max-h-48 object-cover rounded-xl border" />
      ) : (
        <div className="h-32 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
          Aucune photo
        </div>
      )}
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-60"
      >
        {uploading ? "Envoi…" : preview ? "Changer la photo" : "Prendre / choisir une photo"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
