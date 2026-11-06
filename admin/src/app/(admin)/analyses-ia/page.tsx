"use client";

import { useCallback, useEffect, useState } from "react";
import { askDataQuestion, fetchDailySummary, type AiDailySummary, type AiDataAnswer } from "@/lib/api";
import { BtnPrimary, Card, PageHeader } from "@/components/ui";

const EXAMPLES = [
  "Combien de courses terminées et annulées cette semaine, et pourquoi les annulations ?",
  "Quelle ville rapporte le plus de commissions sur 30 jours ?",
  "Comment évoluent les livraisons jour après jour ?",
  "Combien de chauffeurs attendent la validation KYC ?",
];

function List({ title, items, tone }: { title: string; items?: string[]; tone: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className={`text-sm font-semibold ${tone}`}>{title}</p>
      <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export default function AnalysesIaPage() {
  const [summary, setSummary] = useState<AiDailySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [days, setDays] = useState(30);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AiDataAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async (refresh = false) => {
    setSummaryLoading(true);
    try {
      setSummary(await fetchDailySummary(refresh));
    } catch (e) {
      setSummary({ available: false, message: e instanceof Error ? e.message : "Résumé indisponible" });
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary(false);
  }, [loadSummary]);

  async function ask(q = question) {
    const text = q.trim();
    if (text.length < 3) return;
    setQuestion(text);
    setAsking(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await askDataQuestion(text, days);
      if (!res.available) setError(res.message ?? "Analyse indisponible pour le moment.");
      else setAnswer(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse impossible");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Analyses IA"
        subtitle="Résumé du jour et questions sur vos données. L'IA lit des chiffres agrégés en lecture seule, sans numéros ni adresses."
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold">Résumé du jour</h3>
          <button
            type="button"
            className="text-sm text-[#6C63FF] hover:underline disabled:opacity-50"
            disabled={summaryLoading}
            onClick={() => void loadSummary(true)}
          >
            {summaryLoading ? "Génération…" : "Actualiser"}
          </button>
        </div>
        {summaryLoading && !summary ? (
          <p className="text-sm text-gray-500">Génération du résumé (10 à 30 secondes)…</p>
        ) : summary && summary.available ? (
          <div className="space-y-3">
            <p className="text-base font-medium">{summary.headline}</p>
            <List title="Chiffres clés" items={summary.highlights} tone="text-gray-800" />
            <List title="À surveiller" items={summary.alerts} tone="text-orange-700" />
            <List title="Actions proposées" items={summary.actions} tone="text-[#6C63FF]" />
            {summary.generatedAt && (
              <p className="text-xs text-gray-400">Généré le {new Date(summary.generatedAt).toLocaleString("fr-CD")}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-amber-700">{summary?.message ?? "Résumé indisponible."}</p>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold mb-3">Poser une question</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="flex-1 rounded-xl border px-3 py-2 text-sm"
            placeholder="Ex. : Combien de courses annulées à Lubumbashi cette semaine ?"
            value={question}
            maxLength={500}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void ask();
            }}
          />
          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Période"
          >
            <option value={1}>Aujourd&apos;hui</option>
            <option value={7}>7 jours</option>
            <option value={30}>30 jours</option>
            <option value={90}>90 jours</option>
          </select>
          <BtnPrimary onClick={() => void ask()} disabled={asking || question.trim().length < 3}>
            {asking ? "Analyse…" : "Demander"}
          </BtnPrimary>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="text-xs rounded-full border px-3 py-1 text-gray-600 hover:bg-gray-50"
              onClick={() => void ask(ex)}
              disabled={asking}
            >
              {ex}
            </button>
          ))}
        </div>
        {error && <p className="mt-4 text-sm text-amber-700">{error}</p>}
        {answer && answer.available && (
          <div className="mt-4 space-y-3">
            <p className="text-sm whitespace-pre-line">{answer.answer}</p>
            {answer.columns && answer.columns.length > 0 && answer.rows && answer.rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      {answer.columns.map((c) => (
                        <th key={c} className="text-left p-2 border-b">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {answer.rows.map((row, i) => (
                      <tr key={i} className="border-b">
                        {row.map((cell, j) => (
                          <td key={j} className="p-2">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {answer.caveats && answer.caveats.length > 0 && (
              <p className="text-xs text-gray-500">Limites : {answer.caveats.join(" · ")}</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
