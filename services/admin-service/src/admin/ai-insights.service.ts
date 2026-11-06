import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { INTERNAL_API_KEY, MovaErrorCode, MovaHttpException, serviceUrl } from '@mova/shared';
import { AdminService } from './admin.service';

/** Keys never sent to Claude: contact details, credentials, exact positions, payment identifiers. */
const PRIVATE_KEY = /phone|email|password|token|secret|pin|otp|iban|account|card|msisdn|address|lat$|lng$|latitude|longitude|gps|selfie|document|photo|avatar|url/i;

/**
 * Shrinks a metrics payload for the prompt: drops private keys, caps depth, array length and
 * string length, and keeps the whole JSON under maxChars.
 */
export function compactForAi(value: unknown, maxChars = 40_000): string {
  const walk = (v: unknown, depth: number): unknown => {
    if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.length > 160 ? `${v.slice(0, 160)}…` : v;
    if (depth > 5) return undefined;
    if (Array.isArray(v)) return v.slice(0, 40).map((x) => walk(x, depth + 1));
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (PRIVATE_KEY.test(k)) continue;
        const w = walk(x, depth + 1);
        if (w !== undefined) out[k] = w;
      }
      return out;
    }
    return undefined;
  };
  let json = JSON.stringify(walk(value, 0) ?? {});
  if (json.length > maxChars) json = `${json.slice(0, maxChars)}…(tronqué)`;
  return json;
}

type AiAnswer = { available: boolean; result: Record<string, unknown> | null; message?: string };

/** Admin AI: questions on the data, daily summary, reply drafts. Claude runs in driver-service. */
@Injectable()
export class AiInsightsService {
  private readonly logger = new Logger(AiInsightsService.name);
  private summaryCache = new Map<string, { at: number; value: unknown }>();

  constructor(private admin: AdminService) {}

  private async runText(task: 'ANALYTICS_ANSWER' | 'DAILY_SUMMARY' | 'REPLY_DRAFT', context: Record<string, unknown>): Promise<AiAnswer> {
    try {
      const res = await fetch(serviceUrl('driver', '/internal/ai/text'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
        body: JSON.stringify({ task, context }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) return { available: false, result: null, message: `IA indisponible (${res.status}).` };
      return (await res.json()) as AiAnswer;
    } catch (err) {
      this.logger.warn(`AI ${task} failed: ${err instanceof Error ? err.message : err}`);
      return { available: false, result: null, message: 'IA momentanément indisponible.' };
    }
  }

  private async metricsSnapshot(city: string | null, days: number) {
    const [metrics, reports] = await Promise.all([
      this.admin.getMetrics(city, days).catch(() => null),
      this.admin.getReports(days, city ?? undefined).catch(() => null),
    ]);
    return { metrics, reports };
  }

  async ask(question: string, days: number, city: string | null) {
    const q = question.trim();
    if (q.length < 3 || q.length > 500) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Question de 3 à 500 caractères.');
    }
    const period = Math.min(90, Math.max(1, Math.round(days) || 30));
    const data = await this.metricsSnapshot(city, period);
    const answer = await this.runText('ANALYTICS_ANSWER', {
      question: q,
      period: `${period} derniers jours`,
      city: city ?? 'toutes',
      data: compactForAi(data),
    });
    if (!answer.available || !answer.result) {
      return { available: false, message: answer.message ?? 'Analyse indisponible pour le moment.' };
    }
    return { available: true, period, city: city ?? null, ...answer.result };
  }

  async dailySummary(city: string | null, refresh = false) {
    const key = `${city ?? '*'}:${new Date().toISOString().slice(0, 13)}`;
    const cached = this.summaryCache.get(key);
    if (cached && !refresh) return cached.value;
    const [today, week] = await Promise.all([this.metricsSnapshot(city, 1), this.metricsSnapshot(city, 7)]);
    const answer = await this.runText('DAILY_SUMMARY', {
      city: city ?? 'toutes',
      today: compactForAi(today, 25_000),
      week: compactForAi(week, 25_000),
    });
    const value =
      answer.available && answer.result
        ? { available: true, generatedAt: new Date().toISOString(), ...answer.result }
        : { available: false, message: answer.message ?? 'Résumé indisponible pour le moment.' };
    if (answer.available && answer.result) {
      this.summaryCache.set(key, { at: Date.now(), value });
      if (this.summaryCache.size > 200) this.summaryCache.delete(this.summaryCache.keys().next().value as string);
    }
    return value;
  }

  async replyDraft(body: { kind?: string; subject?: string; message?: string }) {
    const message = String(body?.message ?? '').trim();
    if (message.length < 3) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Message du client requis.');
    }
    const answer = await this.runText('REPLY_DRAFT', {
      kind: String(body?.kind ?? 'Litige').slice(0, 60),
      subject: String(body?.subject ?? '').slice(0, 300),
      message: message.slice(0, 2000),
      signature: 'le support SENGA',
    });
    if (!answer.available || !answer.result || typeof answer.result.reply !== 'string') {
      return { available: false, message: answer.message ?? 'Brouillon indisponible pour le moment.' };
    }
    return { available: true, ...answer.result };
  }
}
