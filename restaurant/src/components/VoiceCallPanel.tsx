"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import { createDeliveryLiveKitToken } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";

type VoiceCallPanelProps = {
  deliveryId: string;
  peerLabel?: string;
  onClose: () => void;
};

function roleLabel(role: string) {
  if (role === "passenger") return "Client";
  if (role === "driver") return "Livreur";
  if (role === "partner") return "Partenaire";
  return role || "Participant";
}

export function VoiceCallPanel({ deliveryId, peerLabel = "Appel", onClose }: VoiceCallPanelProps) {
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [remoteNames, setRemoteNames] = useState<string[]>([]);
  const roomRef = useRef<Room | null>(null);
  const audioRootRef = useRef<HTMLDivElement | null>(null);

  const cleanup = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      await room.disconnect();
    }
    if (audioRootRef.current) {
      audioRootRef.current.innerHTML = "";
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
    });
    roomRef.current = room;

    const refreshRemotes = () => {
      const names = Array.from(room.remoteParticipants.values()).map((p) =>
        roleLabel(p.name || p.identity),
      );
      setRemoteNames(names);
    };

    const attachTrack = (track: Track) => {
      if (track.kind !== Track.Kind.Audio || !audioRootRef.current) return;
      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      audioRootRef.current.appendChild(el);
    };

    room.on(RoomEvent.TrackSubscribed, (track) => attachTrack(track));
    room.on(RoomEvent.ParticipantConnected, refreshRemotes);
    room.on(RoomEvent.ParticipantDisconnected, refreshRemotes);
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Connected) setStatus("connected");
      if (state === ConnectionState.Disconnected && !cancelled) {
        setStatus("error");
        setError("Appel terminé ou connexion perdue.");
      }
    });

    (async () => {
      try {
        const creds = await createDeliveryLiveKitToken(deliveryId, { announce: true });
        if (cancelled) return;
        await room.connect(creds.url, creds.token);
        await room.localParticipant.setMicrophoneEnabled(true);
        if (cancelled) return;
        setStatus("connected");
        refreshRemotes();
        for (const p of room.remoteParticipants.values()) {
          for (const pub of p.audioTrackPublications.values()) {
            if (pub.track) attachTrack(pub.track);
          }
        }
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(toUserErrorMessage(e, "Impossible de démarrer l'appel"));
      }
    })();

    return () => {
      cancelled = true;
      void cleanup();
    };
  }, [cleanup, deliveryId]);

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  async function hangUp() {
    await cleanup();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[10080] flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
          <div>
            <p className="font-semibold text-[#1A1A2E]">Appel vocal</p>
            <p className="text-xs text-gray-500">{peerLabel} · #{deliveryId.slice(0, 8)}</p>
          </div>
          <button
            type="button"
            onClick={() => void hangUp()}
            className="text-sm text-gray-500 px-2 py-1 min-h-11"
          >
            Fermer
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div ref={audioRootRef} className="hidden" aria-hidden />
          {status === "connecting" && (
            <p className="text-sm text-gray-600 text-center">Connexion à l&apos;appel…</p>
          )}
          {status === "connected" && (
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-emerald-700">En ligne</p>
              <p className="text-xs text-gray-500">
                {remoteNames.length > 0
                  ? `Avec : ${remoteNames.join(", ")}`
                  : "En attente des autres participants…"}
              </p>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              type="button"
              disabled={status !== "connected"}
              onClick={() => void toggleMute()}
              className="px-4 py-2.5 min-h-11 rounded-xl border text-sm font-medium disabled:opacity-50"
            >
              {muted ? "Activer le micro" : "Couper le micro"}
            </button>
            <button
              type="button"
              onClick={() => void hangUp()}
              className="px-4 py-2.5 min-h-11 rounded-xl bg-red-600 text-white text-sm font-medium"
            >
              Raccrocher
            </button>
          </div>
          <p className="text-[11px] text-gray-400 text-center">
            Appel via Internet (données) — pas de crédit téléphone.
          </p>
        </div>
      </div>
    </div>
  );
}
