"use client";

import { useEffect } from "react";

function notifyUpdate() {
  window.dispatchEvent(new Event("mova:update-available"));
}

function isUpdateMessage(data: unknown) {
  if (data === "MOVA_UPDATE_AVAILABLE") return true;
  return typeof data === "object" && data !== null && (data as { type?: string }).type === "MOVA_UPDATE_AVAILABLE";
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const hadController = Boolean(navigator.serviceWorker.controller);
    const onUpdate = () => {
      if (!hadController) return;
      notifyUpdate();
    };

    let interval = 0;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (isUpdateMessage(event.data)) onUpdate();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.addEventListener("controllerchange", onUpdate);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) notifyUpdate();
        void reg.update();
        interval = window.setInterval(() => void reg.update(), 30_000);
        reg.addEventListener("updatefound", () => {
          const incoming = reg.installing;
          incoming?.addEventListener("statechange", () => {
            if (incoming.state === "installed" && navigator.serviceWorker.controller) notifyUpdate();
          });
        });
      })
      .catch(() => undefined);

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (interval) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      navigator.serviceWorker.removeEventListener("controllerchange", onUpdate);
    };
  }, []);

  return null;
}
