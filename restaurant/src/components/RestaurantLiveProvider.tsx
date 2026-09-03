"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/auth";
import { alertNewRestaurantOrder, initPartnerAudioUnlock, onPartnerAlertsUnlocked } from "@/lib/partner-alerts";
import { registerPartnerWebPush } from "@/lib/partner-web-push";
import { connectRestaurantSocket } from "@/lib/restaurant-socket";

const POLL_MS = 30_000;

type RestaurantLiveContextValue = {
  connected: boolean;
  registerRefresh: (fn: () => void | Promise<void>) => () => void;
};

const RestaurantLiveContext = createContext<RestaurantLiveContextValue | null>(null);

export function RestaurantLiveProvider({ children }: { children: React.ReactNode }) {
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
      void registerPartnerWebPush("restaurant");
    }
    const offUnlock = onPartnerAlertsUnlocked(() => {
      void registerPartnerWebPush("restaurant");
    });
    const pollId = window.setInterval(triggerRefresh, POLL_MS);
    const socket = connectRestaurantSocket({
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
      onOrderEvent: (payload) => {
        if (payload.type === "order" && payload.status === "PENDING") {
          alertNewRestaurantOrder(payload.deliveryId);
        }
        triggerRefresh();
      },
    });

    return () => {
      offUnlock();
      window.clearInterval(pollId);
      socket.disconnect();
      setConnected(false);
    };
  }, [triggerRefresh]);

  return (
    <RestaurantLiveContext.Provider value={{ connected, registerRefresh }}>
      {children}
    </RestaurantLiveContext.Provider>
  );
}

export function useRestaurantLiveRegister(onRefresh: () => void | Promise<void>) {
  const ctx = useContext(RestaurantLiveContext);
  useEffect(() => {
    if (!ctx) return;
    return ctx.registerRefresh(onRefresh);
  }, [ctx, onRefresh]);
}

export function useRestaurantLiveConnected() {
  return useContext(RestaurantLiveContext)?.connected ?? false;
}
