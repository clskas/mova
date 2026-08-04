import { io, type Socket } from "socket.io-client";
import { getToken } from "./auth";
import { PUBLIC_API_BASE } from "./public-api-base";

const API_BASE = PUBLIC_API_BASE;
const WS_BASE = API_BASE;

let sharedSocket: Socket | null = null;

function getSocket(): Socket {
  if (sharedSocket?.connected) return sharedSocket;
  const token = getToken();
  sharedSocket = io(`${WS_BASE}/tracking`, {
    path: "/socket.io",
    transports: ["polling", "websocket"],
    auth: token ? { token } : undefined,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1500,
  });
  sharedSocket.on("connect", () => {
    sharedSocket?.emit("restaurant:subscribe", {});
  });
  return sharedSocket;
}

export function subscribeDeliveryChat(
  deliveryId: string,
  onMessage: (payload: Record<string, unknown>) => void,
) {
  const socket = getSocket();
  const handler = (payload: Record<string, unknown>) => {
    if (payload.deliveryId?.toString() !== deliveryId) return;
    onMessage(payload);
  };
  const join = () => socket.emit("delivery:subscribe", { deliveryId });
  socket.on("delivery:chat", handler);
  if (socket.connected) join();
  else socket.once("connect", join);
  return () => {
    socket.off("delivery:chat", handler);
  };
}

export function subscribeRentalChat(
  inquiryId: string,
  onMessage: (payload: Record<string, unknown>) => void,
) {
  const socket = getSocket();
  const handler = (payload: Record<string, unknown>) => {
    if (payload.inquiryId?.toString() !== inquiryId) return;
    onMessage(payload);
  };
  const join = () => socket.emit("rental:subscribe", { inquiryId });
  socket.on("rental:chat", handler);
  if (socket.connected) join();
  else socket.once("connect", join);
  return () => {
    socket.off("rental:chat", handler);
  };
}
