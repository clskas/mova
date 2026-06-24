import { io, type Socket } from "socket.io-client";
import { getToken } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const WS_BASE = API_BASE.replace(/\/api\/?$/, "");

export type LiveLocationPayload = { lat: number; lng: number; ts?: number };

export function createTrackingSocket(): Socket {
  const token = getToken();
  return io(`${WS_BASE}/tracking`, {
    path: "/socket.io",
    transports: ["polling", "websocket"],
    auth: token ? { token } : undefined,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1500,
  });
}

export function subscribeMission(
  socket: Socket,
  type: "ride" | "delivery",
  id: string,
): void {
  if (type === "ride") {
    socket.emit("ride:subscribe", { rideId: id });
  } else {
    socket.emit("delivery:subscribe", { deliveryId: id });
  }
}
