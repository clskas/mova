"use client";

import { useEffect, useRef, useState } from "react";

const GIS_SRC = "https://accounts.google.com/gsi/client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: { theme?: string; size?: string; text?: string; width?: number; locale?: string },
          ) => void;
        };
      };
    };
  }
}

export function googleClientId(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
}

type Props = {
  onCredential: (idToken: string) => void | Promise<void>;
  disabled?: boolean;
};

export function GoogleContinueButton({ onCredential, disabled }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const [ready, setReady] = useState(false);
  const clientId = googleClientId();

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    function init() {
      if (cancelled || !hostRef.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) void onCredentialRef.current(response.credential);
        },
      });
      hostRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(hostRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        locale: "fr",
        width: 320,
      });
      setReady(true);
    }

    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) init();
      else existing.addEventListener("load", init, { once: true });
      return () => {
        cancelled = true;
      };
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = init;
    document.head.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div className={disabled ? "pointer-events-none opacity-50" : undefined}>
      <div ref={hostRef} className="flex justify-center min-h-[40px]" />
      {!ready && <p className="text-xs text-gray-400 text-center mt-1">Chargement Google…</p>}
    </div>
  );
}
