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

  useEffect(() => {
    const full = resolveMediaUrl(url);
    setSrc(null);
    setFailed(!full);
    if (!full) return;
    if (full.startsWith("data:") || full.startsWith("blob:")) {
      setSrc(full);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(full, { headers: authHeaders() })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(full);
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
