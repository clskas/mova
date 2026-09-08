"use client";

import { useRef, useState } from "react";
import { allowGoogleSignIn, persistGoogleSignedOut } from "@/lib/auth";

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
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            itp_support?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: { theme?: string; size?: string; text?: string; width?: number; locale?: string },
          ) => void;
          disableAutoSelect?: () => void;
          cancel?: () => void;
          prompt?: (cb?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
        };
      };
    };
  }
}

export function googleClientId(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
}

export function disableGoogleAutoSelect() {
  persistGoogleSignedOut();
  try {
    window.google?.accounts?.id?.disableAutoSelect?.();
    window.google?.accounts?.id?.cancel?.();
  } catch {
    /* GIS not loaded */
  }
}

type Props = {
  onCredential: (idToken: string) => void | Promise<void>;
  disabled?: boolean;
};

function buttonWidth(host: HTMLElement | null): number {
  const raw = host?.clientWidth ?? MAX_BTN_WIDTH;
  return Math.max(MIN_BTN_WIDTH, Math.min(MAX_BTN_WIDTH, Math.floor(raw)));
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector(`script[src="${GIS_SRC}"]`) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google indisponible")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google indisponible"));
    document.head.appendChild(script);
  });
}

export function GoogleContinueButton({ onCredential, disabled }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const allowRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const clientId = googleClientId();

  async function startGoogle() {
    if (!clientId || disabled || busy) return;
    allowRef.current = true;
    allowGoogleSignIn();
    setBusy(true);
    try {
      await loadGis();
      if (!hostRef.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.cancel?.();
      window.google.accounts.id.initialize({
        client_id: clientId,
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: false,
        use_fedcm_for_prompt: false,
        callback: (response) => {
          if (!allowRef.current) return;
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
      setGisReady(true);
      window.google.accounts.id.prompt?.();
    } catch {
      allowRef.current = false;
    } finally {
      setBusy(false);
    }
  }

  if (!clientId) return null;

  return (
    <div data-testid="google-continue" className={`google-gis-wrap${disabled ? " pointer-events-none opacity-50" : ""}`}>
      {!gisReady && (
        <button
          type="button"
          data-testid="google-continue-start"
          disabled={disabled || busy}
          onClick={() => void startGoogle()}
          className="w-full py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-[#1A1A2E] disabled:opacity-60"
        >
          {busy ? "Chargement Google…" : "Continuer avec Google"}
        </button>
      )}
      <div ref={hostRef} className={gisReady ? "google-gis-host" : "google-gis-host hidden"} />
    </div>
  );
}
