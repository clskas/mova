"use client";

import { useEffect, useRef, useState } from "react";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const MAX_BTN_WIDTH = 320;
const MIN_BTN_WIDTH = 200;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            ux_mode?: string;
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

function buttonWidth(host: HTMLElement | null): number {
  const raw = host?.clientWidth ?? MAX_BTN_WIDTH;
  return Math.max(MIN_BTN_WIDTH, Math.min(MAX_BTN_WIDTH, Math.floor(raw)));
}

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
        width: buttonWidth(hostRef.current),
      });
      setReady(true);
    }

    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) init();
      else existing.addEventListener("load", init, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.onload = init;
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div data-testid="google-continue" className={`google-gis-wrap${disabled ? " pointer-events-none opacity-50" : ""}`}>
      <div ref={hostRef} className="google-gis-host" />
      {!ready && <p className="text-xs text-gray-400 text-center mt-1">Chargement Google…</p>}
    </div>
  );
}
