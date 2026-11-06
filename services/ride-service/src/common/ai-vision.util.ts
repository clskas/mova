import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

export type AiVisionAnswer = { available: boolean; result: Record<string, unknown> | null; message?: string };

/** Asks driver-service (which holds the Claude key) to run a fixed vision task. Never throws. */
export async function runAiVision(
  task: 'RECEIPT' | 'MOVING_VOLUME',
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
