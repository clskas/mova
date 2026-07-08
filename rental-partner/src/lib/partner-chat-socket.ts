import { io, type Socket } from "socket.io-client";
import { getToken } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const WS_BASE = API_BASE.replace(/\/api\/?$/, "");

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
    sharedSocket?.emit("partner:subscribe", {});
  });
  return sharedSocket;
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
