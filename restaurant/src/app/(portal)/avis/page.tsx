"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchReviews, replyToReview } from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";

export default function AvisPage() {
  const [reviews, setReviews] = useState<
    Array<{ id: string; restaurantScore: number; comment?: string | null; partnerReply?: string | null; createdAt: string }>
  >([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchReviews();
      setReviews(res.reviews ?? []);
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de charger les avis"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendReply(id: string) {
    const reply = (drafts[id] ?? "").trim();
    if (!reply) return;
    setSaving(id);
    try {
      await replyToReview(id, reply);
      setDrafts((d) => ({ ...d, [id]: "" }));
      await load();
    } catch (e) {
      setError(toUserErrorMessage(e, "Envoi impossible"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-[#1A1A2E]">Avis clients</h2>
        <p className="text-sm text-slate-500 mt-1">Répondez aux notes laissées après livraison.</p>
      </div>
      {loading && <p className="text-sm text-slate-500">Chargement…</p>}
      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {!loading && reviews.length === 0 && (
        <p className="text-sm text-slate-600 rounded-xl border bg-white px-4 py-6 text-center">Aucun avis pour le moment.</p>
      )}
      <ul className="space-y-3">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-xl border bg-white p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-amber-600">{r.restaurantScore}/5</span>
              <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString("fr-CD")}</span>
            </div>
            {r.comment && <p className="text-sm text-slate-700">{r.comment}</p>}
            {r.partnerReply ? (
              <p className="text-sm rounded-lg bg-slate-50 px-3 py-2 text-slate-600">
                <span className="font-medium text-slate-800">Votre réponse · </span>
                {r.partnerReply}
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={drafts[r.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                  placeholder="Répondre au client…"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={saving === r.id || !(drafts[r.id] ?? "").trim()}
                  onClick={() => void sendReply(r.id)}
                  className="px-3 py-2 rounded-lg bg-[var(--brand)] text-white text-sm font-medium disabled:opacity-40"
                >
                  {saving === r.id ? "…" : "Répondre"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
