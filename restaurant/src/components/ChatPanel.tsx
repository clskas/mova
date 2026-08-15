"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDeliveryChat, fetchRentalChat, sendDeliveryChat, sendRentalChat } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";
import { subscribeDeliveryChat, subscribeRentalChat } from "@/lib/partner-chat-socket";

export type ChatMessage = {
  id: string;
  text: string;
  senderRole: string;
  ts: number;
  isMine: boolean;
};

type ChatPanelProps = {
  referenceId: string;
  kind: "delivery" | "rental";
  myRole?: string;
  peerLabel?: string;
  subtitle?: string;
  onClose?: () => void;
};

function deliveryChatRoleLabel(role: string) {
  if (role === "passenger") return "Client";
  if (role === "driver") return "Livreur";
  if (role === "partner") return "Restaurant";
  return role;
}

export function ChatPanel({
  referenceId,
  kind,
  myRole = "partner",
  peerLabel = "Client",
  subtitle,
  onClose,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const mapMessages = useCallback(
    (rows: { id?: string; text?: string; senderRole?: string; ts?: number }[]) =>
      rows.map((m) => ({
        id: m.id ?? `${m.ts ?? Date.now()}`,
        text: m.text ?? "",
        senderRole: m.senderRole ?? "",
        ts: m.ts ?? Date.now(),
        isMine: (m.senderRole ?? "") === myRole,
      })),
    [myRole],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const data =
        kind === "delivery"
          ? await fetchDeliveryChat(referenceId)
          : await fetchRentalChat(referenceId);
      setMessages(mapMessages(data.messages ?? []));
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de charger le chat"));
    } finally {
      setLoading(false);
    }
  }, [kind, mapMessages, referenceId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    const unsubscribe =
      kind === "delivery"
        ? subscribeDeliveryChat(referenceId, (payload) => {
            setMessages((prev) => {
              const id = payload.id?.toString() ?? `${payload.ts ?? Date.now()}`;
              if (prev.some((m) => m.id === id)) return prev;
              return [
                ...prev,
                {
                  id,
                  text: payload.text?.toString() ?? "",
                  senderRole: payload.senderRole?.toString() ?? "",
                  ts: Number(payload.ts ?? Date.now()),
                  isMine: payload.senderRole === myRole,
                },
              ];
            });
          })
        : subscribeRentalChat(referenceId, (payload) => {
            setMessages((prev) => {
              const id = payload.id?.toString() ?? `${payload.ts ?? Date.now()}`;
              if (prev.some((m) => m.id === id)) return prev;
              return [
                ...prev,
                {
                  id,
                  text: payload.text?.toString() ?? "",
                  senderRole: payload.senderRole?.toString() ?? "",
                  ts: Number(payload.ts ?? Date.now()),
                  isMine: payload.senderRole === myRole,
                },
              ];
            });
          });
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [kind, load, myRole, referenceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent =
        kind === "delivery"
          ? await sendDeliveryChat(referenceId, trimmed)
          : await sendRentalChat(referenceId, trimmed);
      setText("");
      setMessages((prev) => [
        ...prev,
        {
          id: sent.id ?? `${Date.now()}`,
          text: sent.text ?? trimmed,
          senderRole: myRole,
          ts: sent.ts ?? Date.now(),
          isMine: true,
        },
      ]);
    } catch (e) {
      setError(toUserErrorMessage(e, "Envoi impossible"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-x-2 top-16 bottom-20 z-40 rounded-2xl border border-gray-200 bg-white shadow-lg flex flex-col md:static md:inset-auto md:z-auto md:max-h-[70vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <p className="font-semibold text-sm text-[#1A1A2E]">Chat · {peerLabel}</p>
          <p className="text-xs text-gray-400">
            #{referenceId.slice(0, 8)}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 min-h-11 min-w-11">
            Fermer
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[220px]">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Chargement…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Aucun message pour le moment</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  m.isMine ? "bg-[#6C63FF]/15 text-[#1A1A2E]" : "bg-gray-100 text-gray-800"
                }`}
              >
                {!m.isMine && m.senderRole && (
                  <p className="text-[10px] font-semibold text-gray-500 mb-1">
                    {deliveryChatRoleLabel(m.senderRole)}
                  </p>
                )}
                {m.text}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      {error && <p className="px-4 pb-2 text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 p-3 border-t">
        <input
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
          placeholder="Votre message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
        />
        <button
          type="button"
          disabled={sending}
          onClick={() => void send()}
          className="px-4 py-2.5 min-h-11 rounded-xl bg-[#6C63FF] text-white text-sm font-medium disabled:opacity-60"
        >
          {sending ? "…" : "Envoyer"}
        </button>
      </div>
    </div>
  );
}
