import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

export type AiVisionAnswer = { available: boolean; result: Record<string, unknown> | null; message?: string };

/** Asks driver-service (which holds the Claude key) to run a fixed vision task. Never throws. */
export async function runAiVision(
  task: 'RECEIPT' | 'MOVING_VOLUME' | 'MENU' | 'RENTAL_LISTING',
  imageUrls: string[],
  context: Record<string, unknown> = {},
): Promise<AiVisionAnswer> {
  try {
    const res = await fetch(serviceUrl('driver', '/internal/ai/vision'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify({ task, imageUrls, context }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return { available: false, result: null, message: `IA indisponible (${res.status}).` };
    return (await res.json()) as AiVisionAnswer;
  } catch {
    return { available: false, result: null, message: 'IA momentanément indisponible.' };
  }
}

/** Asks driver-service to run a fixed text-only task (reply draft…). Never throws. */
export async function runAiText(
  task: 'ANALYTICS_ANSWER' | 'DAILY_SUMMARY' | 'REPLY_DRAFT',
  context: Record<string, unknown>,
): Promise<AiVisionAnswer> {
  try {
    const res = await fetch(serviceUrl('driver', '/internal/ai/text'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify({ task, context }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return { available: false, result: null, message: `IA indisponible (${res.status}).` };
    return (await res.json()) as AiVisionAnswer;
  } catch {
    return { available: false, result: null, message: 'IA momentanément indisponible.' };
  }
}

export type ScannedMenuItem = { name: string; unitPriceCdf: number | null; priceUsd: number | null; category: string | null; description: string | null };

/** Keeps only usable menu lines from Claude's reading (names trimmed, prices positive integers). */
export function cleanScannedMenu(result: Record<string, unknown> | null): ScannedMenuItem[] {
  const rows = Array.isArray(result?.items) ? (result!.items as unknown[]) : [];
  const out: ScannedMenuItem[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    if (name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const cdf = typeof r.priceCdf === 'number' && r.priceCdf > 0 ? Math.round(r.priceCdf) : null;
    const usd = typeof r.priceUsd === 'number' && r.priceUsd > 0 ? Math.round(r.priceUsd * 100) / 100 : null;
    const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    out.push({ name, unitPriceCdf: cdf, priceUsd: usd, category: text(r.category, 60), description: text(r.description, 300) });
    if (out.length >= 80) break;
  }
  return out;
}

/** Receipt total vs what the courier declared and the client's budget. */
export function receiptVerdict(
  receipt: Record<string, unknown> | null,
  declaredCdf: number | null | undefined,
  budgetCdf: number | null | undefined,
): { verdict: 'OK' | 'A_VERIFIER' | 'ECART'; reasons: string[] } {
  const reasons: string[] = [];
  if (!receipt || receipt.isReceipt === false || receipt.readable === false) {
    return { verdict: 'A_VERIFIER', reasons: ['Ticket illisible ou absent sur la photo.'] };
  }
  const total = typeof receipt.totalCdf === 'number' ? receipt.totalCdf : null;
  if (total == null) return { verdict: 'A_VERIFIER', reasons: ['Total en francs congolais non lu sur le ticket.'] };
  if (declaredCdf != null && declaredCdf > 0 && Math.abs(total - declaredCdf) > Math.max(500, declaredCdf * 0.1)) {
    reasons.push(`Total du ticket (${total} FC) différent du montant déclaré par le livreur (${declaredCdf} FC).`);
  }
  if (budgetCdf != null && budgetCdf > 0 && total > budgetCdf) {
    reasons.push(`Total du ticket (${total} FC) supérieur au budget du client (${budgetCdf} FC).`);
  }
  return { verdict: reasons.length ? 'ECART' : 'OK', reasons };
}
