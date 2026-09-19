"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Rewrites relative and internal `/api/uploads/...` URLs to the public gateway. */
export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;

  const toGateway = (pathname: string, search = "") => {
    let path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    if (path.startsWith("/uploads/")) path = `/api${path}`;
    if (!path.startsWith("/api/") && !path.includes("/")) {
      path = `/api/uploads/vehicles/${path.replace(/^\//, "")}`;
    }
    return `${API_BASE}${path}${search}`;
  };

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith("/api/uploads") || parsed.pathname.startsWith("/uploads/")) {
        return toGateway(parsed.pathname, parsed.search);
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }
  return toGateway(trimmed);
}

export function AuthenticatedMedia({
  url,
  alt,
  className,
  fallback,
}: {
  url?: string | null;
  alt: string;
  className?: string;
  fallback?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [isPdf, setIsPdf] = useState(false);

  useEffect(() => {
    const full = resolveMediaUrl(url);
    setSrc(null);
    setFailed(!full);
    setIsPdf(false);
    if (!full) return;
    if (full.startsWith("data:") || full.startsWith("blob:")) {
      setSrc(full);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(full, { headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const ct = res.headers.get("content-type") ?? "";
        const blob = await res.blob();
        return { blob, ct };
      })
      .then(({ blob, ct }) => {
        if (cancelled) return;
        const pdf =
          ct.includes("pdf") ||
          blob.type.includes("pdf") ||
          (url ?? "").toLowerCase().endsWith(".pdf");
        objectUrl = URL.createObjectURL(blob);
        setIsPdf(pdf);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (!url || failed) {
    return (
      <p className="text-xs text-gray-500">
        {fallback ?? "Photo non fournie."}
      </p>
    );
  }

  if (!src) {
    return <div className={`${className ?? ""} bg-gray-100 animate-pulse rounded-lg border`} aria-hidden />;
  }

  if (isPdf) {
    return (
      <div className="space-y-2">
        <iframe title={alt} src={src} className={`${className ?? ""} min-h-[420px] w-full rounded-lg border`} />
        <a href={src} target="_blank" rel="noreferrer" className="text-sm text-[#6C63FF] underline">
          Ouvrir le PDF
        </a>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
