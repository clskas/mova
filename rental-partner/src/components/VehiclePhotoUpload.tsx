"use client";

import { useState } from "react";
import { mediaUrl, uploadVehiclePhoto } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";
import { ImageSourcePicker } from "@/components/ImageSourcePicker";

type Props = {
  value?: string | null;
  onChange: (url: string | null) => void;
  onError?: (message: string) => void;
};

export function VehiclePhotoUpload({ value, onChange, onError }: Props) {
  const [uploading, setUploading] = useState(false);
  const preview = mediaUrl(value);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadVehiclePhoto(file);
      onChange(url);
    } catch (e) {
      onError?.(toUserErrorMessage(e, "Échec envoi photo"));
    } finally {
      setUploading(false);
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
      <ImageSourcePicker
        disabled={uploading}
        onSelect={handleFile}
        label={uploading ? "Envoi…" : preview ? "Changer la photo" : "Prendre / choisir une photo"}
      />
    </div>
  );
}
