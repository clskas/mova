"use client";

import { useEffect } from "react";
import { getToken } from "@/lib/auth";
import { registerPartnerWebPush } from "@/lib/partner-web-push";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        void reg.update();
        if (getToken()) void registerPartnerWebPush("rental_partner");
        reg.addEventListener("updatefound", () => {
          const incoming = reg.installing;
          incoming?.addEventListener("statechange", () => {
            if (incoming.state === "installed" && navigator.serviceWorker.controller) {
              window.dispatchEvent(new Event("mova:update-available"));
            }
          });
        });
      })
      .catch(() => undefined);
  }, []);

  return null;
}
