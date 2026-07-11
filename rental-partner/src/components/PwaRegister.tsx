"use client";

import { useEffect } from "react";
import { getToken } from "@/lib/auth";
import { registerPartnerWebPush } from "@/lib/partner-web-push";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        if (getToken()) void registerPartnerWebPush("rental_partner");
      })
      .catch(() => undefined);
  }, []);

  return null;
}
