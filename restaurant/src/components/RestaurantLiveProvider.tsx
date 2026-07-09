"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { getToken } from "@/lib/auth";
import { alertNewRestaurantOrder, initPartnerAudioUnlock, requestPartnerNotificationPermission } from "@/lib/partner-alerts";
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
    if (!getToken()) return;

    let socket: Socket | null = null;
    let pollId: number | null = null;

    if (typeof window !== "undefined") {
      initPartnerAudioUnlock();
      requestPartnerNotificationPermission();
      pollId = window.setInterval(triggerRefresh, POLL_MS);
      socket = connectRestaurantSocket({
        onConnect: () => setConnected(true),
        onDisconnect: () => setConnected(false),
        onOrderEvent: (payload) => {
          if (payload.type === "order" && payload.status === "PENDING") {
            alertNewRestaurantOrder(payload.deliveryId);
          }
          triggerRefresh();
        },
      });
    }

    return () => {
      if (pollId != null) window.clearInterval(pollId);
      socket?.disconnect();
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
