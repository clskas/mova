"use client";

import { useEffect, useMemo, useState } from "react";

export type PubliciteItem = {
  id: string;
  titre: string;
  imageUrl: string;
  lien?: string | null;
  description?: string | null;
};

const CARD_GRADIENT = "linear-gradient(90deg, #2F6BFF 0%, #4F55E8 55%, #6B4FE8 100%)";

function resolveImage(url: string, apiBase: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${apiBase}${url.startsWith("/") ? url : `/${url}`}`;
}

function dismissStorageKey() {
  return "mova-publicites-dismissed";
}

function readDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(dismissStorageKey());
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function persistDismissed(ids: string[]) {
  sessionStorage.setItem(dismissStorageKey(), JSON.stringify(ids));
}

function PubliciteDetailModal({
  item,
  apiBase,
  onClose,
}: {
  item: PubliciteItem;
  apiBase: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={item.titre}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/45 text-white text-sm hover:bg-black/60 flex items-center justify-center"
          aria-label="Fermer"
        >
          ×
        </button>
        <img
          src={resolveImage(item.imageUrl, apiBase)}
          alt={item.titre}
          className="w-full h-52 object-cover"
        />
        <div className="p-5 space-y-3 text-center">
          <h3 className="text-lg font-bold text-[#1A1A2E]">{item.titre}</h3>
          {item.description && (
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{item.description}</p>
          )}
          {item.lien && (
            <a
              href={item.lien}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex px-5 py-2.5 rounded-xl text-white text-sm font-medium"
              style={{ background: CARD_GRADIENT }}
            >
              En savoir plus
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function PubliciteCarousel({
  items,
  apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
  intervalMs = 5000,
  className = "",
}: {
  items: PubliciteItem[];
  apiBase?: string;
  intervalMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [detail, setDetail] = useState<PubliciteItem | null>(null);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  const visible = useMemo(() => items.filter((i) => !dismissed.includes(i.id)), [items, dismissed]);

  useEffect(() => {
    setIndex(0);
  }, [visible.length]);

  useEffect(() => {
    if (visible.length <= 1 || paused || detail) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % visible.length), intervalMs);
    return () => clearInterval(t);
  }, [visible.length, intervalMs, paused, detail]);

  function dismissCurrent(id: string) {
    const next = [...dismissed, id];
    setDismissed(next);
    persistDismissed(next);
  }

  if (visible.length === 0) return null;

  const current = visible[index] ?? visible[0]!;

  return (
    <>
      <div className={className} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div
          className="relative rounded-3xl overflow-hidden shadow-md"
          style={{ background: CARD_GRADIENT }}
        >
          <button
            type="button"
            onClick={() => dismissCurrent(current.id)}
            className="absolute top-3 right-3 z-20 w-7 h-7 rounded-full bg-black/25 text-white text-sm hover:bg-black/40 flex items-center justify-center backdrop-blur-sm"
            aria-label="Fermer la publicité"
          >
            ×
          </button>

          <button
            type="button"
            onClick={() => setDetail(current)}
            className="flex w-full items-center gap-2 sm:gap-3 p-2 sm:p-4 pr-11 min-h-14 sm:min-h-[6.5rem] text-left hover:brightness-105 transition"
          >
            <div className="shrink-0 w-14 h-14 sm:w-[4.5rem] sm:h-[4.5rem] rounded-2xl overflow-hidden bg-white/15 ring-1 ring-white/20">
              <img
                src={resolveImage(current.imageUrl, apiBase)}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0 text-center px-1">
              <p className="font-bold text-[15px] leading-snug text-white line-clamp-2">{current.titre}</p>
              {current.description && (
                <p className="hidden sm:block text-xs text-white/90 mt-1.5 leading-relaxed line-clamp-2">{current.description}</p>
              )}
            </div>
          </button>
        </div>

        {visible.length > 1 && (
          <div className="flex justify-center items-center gap-2 mt-1.5 sm:mt-3">
            {visible.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === index ? "w-7 h-2 bg-[#7EB0FF]" : "w-2 h-2 bg-[#7EB0FF]/40 hover:bg-[#7EB0FF]/60"
                }`}
                aria-label={`Publicité ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {detail && <PubliciteDetailModal item={detail} apiBase={apiBase} onClose={() => setDetail(null)} />}
    </>
  );
}
