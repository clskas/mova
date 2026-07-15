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
        if (getToken()) void registerPartnerWebPush("restaurant");
      })
      .catch(() => undefined);
  }, []);

  return null;
}
