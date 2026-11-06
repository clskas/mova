"use client";

import { useState } from "react";
import { uploadVehiclePhoto } from "@/lib/api";
import { ImageSourcePicker } from "@/components/ImageSourcePicker";
import { mediaUrl } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";

export const MAX_VEHICLE_PHOTOS = 5;

/** Photo list to edit: the stored list, or the legacy single imageUrl. */
export function initialVehiclePhotos(v: { photoUrls?: string[] | null; imageUrl?: string | null }): string[] {
  if (v.photoUrls && v.photoUrls.length > 0) return v.photoUrls.slice(0, MAX_VEHICLE_PHOTOS);
  return v.imageUrl ? [v.imageUrl] : [];
}

type Props = {
  value: string[];
  onChange: (urls: string[]) => void;
  onError?: (message: string) => void;
  label?: string;
  disabled?: boolean;
};

/** Up to 5 vehicle photos; the first one is the main photo shown to customers. */
export function VehiclePhotosUpload({ value, onChange, onError, label = "Photos du véhicule", disabled = false }: Props) {
  const [uploading, setUploading] = useState(false);
  const full = value.length >= MAX_VEHICLE_PHOTOS;

  async function handleFile(file: File | null) {
    if (!file || disabled || full) return;
    setUploading(true);
    try {
      const url = await uploadVehiclePhoto(file);
      onChange([...value, url].slice(0, MAX_VEHICLE_PHOTOS));
    } catch (e) {
      onError?.(toUserErrorMessage(e, "Échec envoi photo"));
    } finally {
      setUploading(false);
    }
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function makeMain(index: number) {
    if (index === 0) return;
    const next = [...value];
    const [picked] = next.splice(index, 1);
    onChange([picked, ...next]);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">
        {label} <span className="text-gray-400 font-normal">({value.length}/{MAX_VEHICLE_PHOTOS})</span>
      </p>
      {value.length === 0 ? (
        <div className="h-32 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
          Aucune photo
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {value.map((url, i) => (
            <div key={url} className="relative rounded-xl border overflow-hidden bg-gray-50">
              <img src={mediaUrl(url) ?? undefined} alt={`Photo ${i + 1}`} className="w-full h-28 object-cover" />
              {i === 0 && (
                <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-indigo-600 text-white">
                  Principale
                </span>
              )}
              {!disabled && (
                <div className="flex justify-between gap-1 p-1">
                  {i > 0 ? (
                    <button type="button" onClick={() => makeMain(i)} className="text-[11px] text-indigo-700">
                      Mettre en premier
                    </button>
                  ) : (
                    <span />
                  )}
                  <button type="button" onClick={() => remove(i)} className="text-[11px] text-red-600">
                    Retirer
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!disabled && !full && (
        <ImageSourcePicker
          disabled={uploading}
          onSelect={handleFile}
          label={uploading ? "Envoi…" : value.length ? "Ajouter une photo" : "Prendre / choisir une photo"}
        />
      )}
      <p className="text-xs text-gray-500">
        Jusqu&apos;à {MAX_VEHICLE_PHOTOS} photos (avant, arrière, côté, intérieur…). La première est la photo principale.
      </p>
    </div>
  );
}
