import { aiSwitchOn } from '../common/ai-switch';
import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { MARKET_RDC, currentRequestLanguage, type AppLanguage } from '@mova/shared';
import { DRIVER_MANUAL, PASSENGER_MANUAL } from './manuals.generated';

export type AssistantApp = 'passenger' | 'driver';
export type AssistantMessage = { role: 'user' | 'assistant'; content: string };

/** Default model for the support assistant; override with ASSISTANT_MODEL. */
export const DEFAULT_ASSISTANT_MODEL = 'claude-opus-5-5';
/** Messages a user may send per day (protects the credits). Override with ASSISTANT_DAILY_LIMIT. */
export const DEFAULT_DAILY_LIMIT = 40;
const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 2000;

export function supportContactLine(): string {
  return `WhatsApp ${MARKET_RDC.support.whatsapp} ou « Aide → Contacter le support » dans l'app`;
}

export function systemPromptFor(app: AssistantApp): string {
  const who = app === 'driver' ? 'chauffeurs (app SENGA Driver)' : 'passagers et clients (app SENGA)';
  const manual = app === 'driver' ? DRIVER_MANUAL : PASSENGER_MANUAL;
  return [
    `Tu es l'assistant support de SENGA, une application de mobilité et de livraison en République Démocratique du Congo. Tu aides les ${who}.`,
    'Réponds dans la langue du dernier message de l’utilisateur (français, lingala, swahili, anglais…). Sois bref, concret et poli, en 2 à 6 phrases ou une courte liste d’étapes.',
    'Appuie-toi uniquement sur le manuel ci-dessous. Si la réponse n’y est pas, ou si la demande concerne un litige, un remboursement, un paiement précis, un accident, une urgence ou des données de compte, dis-le simplement et oriente vers le support humain : ' +
      supportContactLine() +
      '. En cas de danger immédiat, rappelle le bouton SOS de l’app.',
    'Ne promets jamais de remboursement, de prix exact ou de délai. Ne demande jamais de mot de passe, de code PIN, de code OTP ni de numéro de carte.',
    '<manuel>\n' + manual + '\n</manuel>',
  ].join('\n\n');
}

/** Language block sent after the cached manual, so the cache stays shared by all users. */
export function languageInstruction(lang: AppLanguage): string {
  switch (lang) {
    case 'en':
      return 'The user chose English in the app. Answer in English, unless their last message is clearly in another language.';
    case 'sw':
      return 'L’utilisateur a choisi le swahili dans l’app. Réponds en swahili simple (kiswahili de l’est de la RDC), sauf si son dernier message est clairement dans une autre langue.';
    case 'ln':
      return 'L’utilisateur a choisi le lingala dans l’app. Réponds en lingala simple (comme à Kinshasa), sauf si son dernier message est clairement dans une autre langue.';
    default:
      return 'L’utilisateur a choisi le français dans l’app. Réponds en français, sauf si son dernier message est clairement dans une autre langue.';
  }
}

/** Last messages only, valid roles, trimmed text, starting with the user. */
export function sanitizeHistory(raw: unknown): AssistantMessage[] {
  if (!Array.isArray(raw)) return [];
  const msgs = raw
    .filter((m): m is { role: string; content: string } => !!m && typeof m === 'object')
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(m.content ?? '').trim().slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((m) => m.content.length > 0)
    .slice(-MAX_HISTORY);
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly usage = new Map<string, { day: string; count: number }>();

  available(): boolean {
    return aiSwitchOn() && Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  }

  /** Counts one message for today; false when the daily limit is reached. */
  takeQuota(userId: string, now = new Date()): boolean {
    const limit = Number(process.env.ASSISTANT_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT;
    const day = now.toISOString().slice(0, 10);
    const entry = this.usage.get(userId);
    const count = entry && entry.day === day ? entry.count : 0;
    if (count >= limit) return false;
    this.usage.set(userId, { day, count: count + 1 });
    if (this.usage.size > 50_000) this.usage.clear();
    return true;
  }

  async chat(userId: string, app: AssistantApp, rawMessages: unknown) {
    const unavailable = {
      available: false,
      reply: `L’assistant est momentanément indisponible. Contactez le support : ${supportContactLine()}.`,
    };
    const messages = sanitizeHistory(rawMessages);
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return { available: true, reply: 'Posez votre question, je vous réponds.' };
    }
    if (!this.available()) return unavailable;
    if (!this.takeQuota(userId)) {
      return {
        available: true,
        reply: `Vous avez atteint la limite de messages pour aujourd’hui. Pour continuer, contactez le support : ${supportContactLine()}.`,
      };
    }
    try {
      const client = new Anthropic(); // reads ANTHROPIC_API_KEY
      const response = await client.beta.messages.create({
        model: process.env.ASSISTANT_MODEL?.trim() || DEFAULT_ASSISTANT_MODEL,
        max_tokens: 2048,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        // The manual is the same on every call: cache it.
        system: [
          { type: 'text', text: systemPromptFor(app), cache_control: { type: 'ephemeral' } },
          { type: 'text', text: languageInstruction(currentRequestLanguage()) },
        ],
        messages,
      });
      if (response.stop_reason === 'refusal') {
        return { available: true, reply: `Je ne peux pas répondre à cette demande. Contactez le support : ${supportContactLine()}.` };
      }
      const reply = response.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim();
      return { available: true, reply: reply || unavailable.reply };
    } catch (err) {
      this.logger.warn(`Assistant failed for ${userId}: ${err instanceof Error ? err.message.slice(0, 200) : err}`);
      return unavailable;
    }
  }
}
