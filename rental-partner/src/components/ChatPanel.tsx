"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRentalChat, sendRentalChat } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";
import { subscribeRentalChat } from "@/lib/partner-chat-socket";

export type ChatMessage = {
  id: string;
  text: string;
  senderRole: string;
  ts: number;
  isMine: boolean;
};

type ChatPanelProps = {
  inquiryId: string;
  peerLabel?: string;
  onClose?: () => void;
};

export function ChatPanel({ inquiryId, peerLabel = "Client", onClose }: ChatPanelProps) {
  const myRole = "partner";
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
    [],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchRentalChat(inquiryId);
      setMessages(mapMessages(data.messages ?? []));
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de charger le chat"));
    } finally {
      setLoading(false);
    }
  }, [inquiryId, mapMessages]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    const unsubscribe = subscribeRentalChat(inquiryId, (payload) => {
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
  }, [inquiryId, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendRentalChat(inquiryId, trimmed);
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
    <div className="rounded-2xl border border-gray-200 bg-white shadow-lg flex flex-col max-h-[70vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <p className="font-semibold text-sm text-gray-900">Chat · {peerLabel}</p>
          <p className="text-xs text-gray-400">#{inquiryId.slice(0, 8)}</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">
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
                  m.isMine ? "bg-indigo-100 text-gray-900" : "bg-gray-100 text-gray-800"
                }`}
              >
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
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-60"
        >
          {sending ? "…" : "Envoyer"}
        </button>
      </div>
    </div>
  );
}
