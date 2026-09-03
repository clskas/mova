"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/auth";
import { alertNewRentalBooking, initPartnerAudioUnlock, onPartnerAlertsUnlocked } from "@/lib/partner-alerts";
import { registerPartnerWebPush } from "@/lib/partner-web-push";
import { connectPartnerSocket } from "@/lib/partner-socket";

const POLL_MS = 30_000;

type PartnerLiveContextValue = {
  connected: boolean;
  registerRefresh: (fn: () => void | Promise<void>) => () => void;
};

const PartnerLiveContext = createContext<PartnerLiveContextValue | null>(null);

export function PartnerLiveProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef(new Set<() => void | Promise<void>>());

  const registerRefresh = useCallback((fn: () => void | Promise<void>) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  const triggerRefresh = useCallback(() => {
    listenersRef.current.forEach((fn) => {
      void fn();
    });
  }, []);

  useEffect(() => {
    if (!getToken() || typeof window === "undefined") return;

    initPartnerAudioUnlock();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      void registerPartnerWebPush("rental_partner");
    }
    const offUnlock = onPartnerAlertsUnlocked(() => {
      void registerPartnerWebPush("rental_partner");
    });
    const pollId = window.setInterval(triggerRefresh, POLL_MS);
    const socket = connectPartnerSocket({
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
      onRentalEvent: (payload) => {
        if (payload.type === "rental" && payload.status === "PENDING") {
          alertNewRentalBooking(payload.inquiryId);
        }
        triggerRefresh();
      },
      onVehicleEvent: triggerRefresh,
    });

    return () => {
      offUnlock();
      window.clearInterval(pollId);
      socket.disconnect();
      setConnected(false);
    };
  }, [triggerRefresh]);

  return (
    <PartnerLiveContext.Provider value={{ connected, registerRefresh }}>
      {children}
    </PartnerLiveContext.Provider>
  );
}

export function usePartnerLiveRegister(onRefresh: () => void | Promise<void>) {
  const ctx = useContext(PartnerLiveContext);
  useEffect(() => {
    if (!ctx) return;
    return ctx.registerRefresh(onRefresh);
  }, [ctx, onRefresh]);
}

export function usePartnerLiveConnected() {
  return useContext(PartnerLiveContext)?.connected ?? false;
}
