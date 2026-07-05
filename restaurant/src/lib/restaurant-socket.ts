import { io, type Socket } from "socket.io-client";
import { getToken } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const WS_BASE = API_BASE.replace(/\/api\/?$/, "");

export type RestaurantLivePayload = {
  type: "order" | "order-status";
  deliveryId: string;
  status: string;
};

export type RestaurantSocketHandlers = {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onOrderEvent?: (payload: RestaurantLivePayload) => void;
};

export function connectRestaurantSocket(handlers: RestaurantSocketHandlers = {}): Socket {
  const token = getToken();
  const socket = io(`${WS_BASE}/tracking`, {
    path: "/socket.io",
    transports: ["polling", "websocket"],
    auth: token ? { token } : undefined,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1500,
  });

  socket.on("connect", () => {
    socket.emit("restaurant:subscribe", {});
    handlers.onConnect?.();
  });
  socket.on("disconnect", () => handlers.onDisconnect?.());
  socket.on("restaurant:order", (payload: RestaurantLivePayload) => {
    handlers.onOrderEvent?.(payload);
  });

  return socket;
}
