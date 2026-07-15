"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type Props = {
  onSelect: (file: File) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  accept?: string;
};

/**
 * Bouton de sélection d'image offrant un choix explicite : « Prendre une photo »
 * (appareil photo) ou « Choisir dans la galerie ». Deux <input> distincts
 * garantissent le bon comportement sur tous les navigateurs / PWA installées,
 * où un simple `capture` force la caméra sans laisser le choix de la galerie.
 */
export function ImageSourcePicker({
  onSelect,
  disabled,
  label = "Ajouter une photo",
  className,
  accept = "image/*",
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open]);

  function pick(ref: RefObject<HTMLInputElement | null>) {
    setOpen(false);
    ref.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onSelect(file);
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={
          className ??
          "px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-60"
        }
      >
        {label}
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => pick(cameraRef)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50"
          >
            <span className="text-lg">📷</span> Prendre une photo
          </button>
          <button
            type="button"
            onClick={() => pick(galleryRef)}
            className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50"
          >
            <span className="text-lg">🖼️</span> Choisir dans la galerie
          </button>
        </div>
      )}
      <input
        ref={cameraRef}
        type="file"
        accept={accept}
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      <input
        ref={galleryRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
