"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGpsTrace, type GpsPoint } from "@/lib/api";
import {
  createTrackingSocket,
  subscribeMission,
  type LiveLocationPayload,
} from "@/lib/tracking-socket";

function appendPoint(points: GpsPoint[], lat: number, lng: number): GpsPoint[] {
  const last = points[points.length - 1];
  if (last && Math.abs(last.lat - lat) < 0.00001 && Math.abs(last.lng - lng) < 0.00001) {
    return points;
  }
  return [...points, { lat, lng, recordedAt: new Date().toISOString() }];
}

type Options = {
  type: "ride" | "delivery";
  id: string | null | undefined;
  active: boolean;
  seed?: GpsPoint[];
};

export function useLiveGpsTrace({ type, id, active, seed = [] }: Options) {
  const [points, setPoints] = useState<GpsPoint[]>(seed);
  const [livePosition, setLivePosition] = useState<{ lat: number; lng: number } | null>(null);
  const [socketLive, setSocketLive] = useState(false);
  const seedKey = useRef("");

  useEffect(() => {
    const key = seed.map((p) => `${p.lat},${p.lng}`).join("|");
    if (key !== seedKey.current) {
      seedKey.current = key;
      setPoints(seed);
      if (seed.length > 0) {
        const last = seed[seed.length - 1];
        setLivePosition({ lat: last.lat, lng: last.lng });
      }
    }
  }, [seed]);

  const refreshTrace = useCallback(async () => {
    if (!id) return;
    try {
      const trace = await fetchGpsTrace(type, id);
      const next = trace.points ?? [];
      if (next.length > 0) {
        setPoints(next);
        const last = next[next.length - 1];
        setLivePosition({ lat: last.lat, lng: last.lng });
      }
    } catch {
      /* garde les points socket */
    }
  }, [id, type]);

  useEffect(() => {
    if (!id || !active) {
      setSocketLive(false);
      return;
    }

    const socket = createTrackingSocket();

    const onLocation = (data: LiveLocationPayload) => {
      if (typeof data.lat !== "number" || typeof data.lng !== "number") return;
      setLivePosition({ lat: data.lat, lng: data.lng });
      setPoints((prev) => appendPoint(prev, data.lat, data.lng));
    };

    socket.on("connect", () => {
      setSocketLive(true);
      subscribeMission(socket, type, id);
    });
    socket.on("disconnect", () => setSocketLive(false));
    socket.on("driver:location", onLocation);
    socket.on("ride:location", onLocation);
    socket.on("courier:location", onLocation);

    const poll = setInterval(refreshTrace, 5000);
    refreshTrace();

    return () => {
      clearInterval(poll);
      socket.off("driver:location", onLocation);
      socket.off("ride:location", onLocation);
      socket.off("courier:location", onLocation);
      socket.disconnect();
      setSocketLive(false);
    };
  }, [id, active, type, refreshTrace]);

  return { points, livePosition, socketLive };
}
