import { io, type Socket } from "socket.io-client";
import { getToken } from "./auth";

import { PUBLIC_API_BASE } from "./public-api-base";

const API_BASE = PUBLIC_API_BASE;
const WS_BASE = API_BASE;

export type PartnerRentalLivePayload = {
  type: "rental" | "booking-status";
  kind?: string;
  inquiryId: string;
  status: string;
};

export type PartnerVehicleLivePayload = {
  vehicleId: string;
  action: "created" | "updated" | "deleted" | "reviewed";
  approvalStatus?: string;
  isActive?: boolean;
};

export type PartnerSocketHandlers = {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onRentalEvent?: (payload: PartnerRentalLivePayload) => void;
  onVehicleEvent?: (payload: PartnerVehicleLivePayload) => void;
};

export function connectPartnerSocket(handlers: PartnerSocketHandlers = {}): Socket {
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
    socket.emit("partner:subscribe", {});
    handlers.onConnect?.();
  });
  socket.on("disconnect", () => handlers.onDisconnect?.());
  socket.on("partner:rental", (payload: PartnerRentalLivePayload) => {
    handlers.onRentalEvent?.(payload);
  });
  socket.on("partner:vehicle", (payload: PartnerVehicleLivePayload) => {
    handlers.onVehicleEvent?.(payload);
  });

  return socket;
}
