"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  file: File;
  onConfirm: (file: File) => void;
  onCancel: () => void;
};

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Modal de rognage libre (canvas) — utilisé après sélection caméra/galerie.
 */
export function ImageCropDialog({ file, onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ mode: "move" | "br"; startX: number; startY: number; rect: Rect } | null>(null);
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const paint = useCallback((r: Rect) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(r.x, r.y, r.w, r.h);
    ctx.drawImage(img, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    const hs = 10;
    ctx.fillStyle = "#6366f1";
    ctx.fillRect(r.x + r.w - hs, r.y + r.h - hs, hs, hs);
  }, []);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = Math.min(560, typeof window !== "undefined" ? window.innerWidth - 48 : 560);
      const scale = Math.min(1, maxW / img.naturalWidth, 420 / img.naturalHeight);
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const pad = Math.round(Math.min(canvas.width, canvas.height) * 0.08);
      const initial = {
        x: pad,
        y: pad,
        w: canvas.width - pad * 2,
        h: canvas.height - pad * 2,
      };
      setRect(initial);
      paint(initial);
      setReady(true);
    };
    img.onerror = () => onCancel();
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, onCancel, paint]);

  useEffect(() => {
    if (ready) paint(rect);
  }, [rect, ready, paint]);

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const b = canvas.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * canvas.width;
    const y = ((e.clientY - b.top) / b.height) * canvas.height;
    return { x, y };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = pointerPos(e);
    const hs = 14;
    const nearBr =
      p.x >= rect.x + rect.w - hs &&
      p.x <= rect.x + rect.w + 4 &&
      p.y >= rect.y + rect.h - hs &&
      p.y <= rect.y + rect.h + 4;
    const inside =
      p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
    if (!nearBr && !inside) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: nearBr ? "br" : "move",
      startX: p.x,
      startY: p.y,
      rect: { ...rect },
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const p = pointerPos(e);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    if (drag.mode === "move") {
      const w = drag.rect.w;
      const h = drag.rect.h;
      setRect({
        x: Math.max(0, Math.min(canvas.width - w, drag.rect.x + dx)),
        y: Math.max(0, Math.min(canvas.height - h, drag.rect.y + dy)),
        w,
        h,
      });
    } else {
      setRect({
        x: drag.rect.x,
        y: drag.rect.y,
        w: Math.max(40, Math.min(canvas.width - drag.rect.x, drag.rect.w + dx)),
        h: Math.max(40, Math.min(canvas.height - drag.rect.y, drag.rect.h + dy)),
      });
    }
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function confirm() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    setBusy(true);
    try {
      const scaleX = img.naturalWidth / canvas.width;
      const scaleY = img.naturalHeight / canvas.height;
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(rect.w * scaleX));
      out.height = Math.max(1, Math.round(rect.h * scaleY));
      const ctx = out.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(
        img,
        rect.x * scaleX,
        rect.y * scaleY,
        rect.w * scaleX,
        rect.h * scaleY,
        0,
        0,
        out.width,
        out.height,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        out.toBlob(resolve, "image/jpeg", 0.85),
      );
      if (!blob) return;
      const base = file.name.replace(/\.[^.]+$/, "") || "photo";
      onConfirm(new File([blob], `${base}-crop.jpg`, { type: "image/jpeg" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Rogner l&apos;image</h3>
          <p className="text-xs text-gray-500">Déplacez le cadre · tirez le coin bas-droit pour redimensionner</p>
        </div>
        <div className="flex justify-center overflow-auto max-h-[60vh] rounded-xl bg-gray-100 p-2">
          <canvas
            ref={canvasRef}
            className="max-w-full touch-none cursor-move rounded-lg"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-xl border text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!ready || busy}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "…" : "Utiliser"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function isCroppableImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}
