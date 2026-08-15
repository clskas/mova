"use client";

import { useEffect } from "react";
import { getToken } from "@/lib/auth";
import { registerPartnerWebPush } from "@/lib/partner-web-push";

function notifyUpdate() {
  window.dispatchEvent(new Event("mova:update-available"));
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let interval = 0;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
      }
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (getToken()) void registerPartnerWebPush("restaurant");
        if (reg.waiting && navigator.serviceWorker.controller) notifyUpdate();
        void reg.update();
        interval = window.setInterval(() => void reg.update(), 60_000);
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
    };
  }, []);

  return null;
}
