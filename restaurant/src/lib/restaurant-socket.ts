import { io, type Socket } from "socket.io-client";
import { getToken } from "./auth";
import { PUBLIC_API_BASE } from "./public-api-base";

const API_BASE = PUBLIC_API_BASE;
const WS_BASE = API_BASE;

export type RestaurantLivePayload = {
  type: "order" | "order-status" | "order-payment";
  deliveryId: string;
  status: string;
  isPaid?: boolean;
  paymentStatus?: string | null;
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
