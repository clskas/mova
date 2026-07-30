import { Body, Controller, Headers, Logger, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PaymentsService } from './payments.service';

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function normalizeOutcome(raw?: string): 'COMPLETED' | 'FAILED' | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'COMPLETE', 'PAID', 'OK', 'TS-SUCCESS'].includes(s)) {
    return 'COMPLETED';
  }
  if (['FAILED', 'FAIL', 'ERROR', 'CANCELLED', 'CANCELED', 'REJECTED', 'TIMEOUT', 'TS-FAILED'].includes(s)) {
    return 'FAILED';
  }
  return null;
}

@ApiTags('payments-webhooks')
@Controller('payments')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    private payments: PaymentsService,
    private config: ConfigService,
  ) {}

  private verifySerdiPaySignature(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
    const secret = this.config.get<string>('SERDIPAY_WEBHOOK_SECRET')?.trim();
    if (!secret) {
      // Dev / misconfigured: accept but log. Production should set the secret.
      this.logger.warn('SERDIPAY_WEBHOOK_SECRET unset — webhook accepted without signature check');
      return true;
    }
    const header =
      (typeof headers['x-serdipay-signature'] === 'string' && headers['x-serdipay-signature']) ||
      (typeof headers['x-signature'] === 'string' && headers['x-signature']) ||
      (typeof headers['x-hub-signature-256'] === 'string' && headers['x-hub-signature-256']) ||
      '';
    if (!header) return false;
    const provided = header.replace(/^sha256=/i, '').trim();
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      const a = Buffer.from(provided, 'hex');
      const b = Buffer.from(expected, 'hex');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return provided === expected;
    }
  }

  private extractProviderRef(payload: Record<string, unknown>, fallbackPrefix: 'sp' | 'at'): string | undefined {
    const nested = asRecord(payload.data ?? payload.payload ?? payload.result ?? {});
    const candidates = [
      pickString(payload, ['providerRef', 'provider_ref', 'externalId', 'external_id', 'transactionId', 'transaction_id', 'txnId', 'id']),
      pickString(nested, ['providerRef', 'provider_ref', 'externalId', 'external_id', 'transactionId', 'transaction_id', 'txnId', 'id']),
      pickString(payload, ['reference', 'merchantReference', 'clientReference', 'metadata']),
      pickString(nested, ['reference', 'merchantReference', 'clientReference']),
    ].filter(Boolean) as string[];

    for (const c of candidates) {
      if (c.startsWith('sp_') || c.startsWith('at_')) return c;
      if (c.startsWith('topup_') || c.includes(':') || c.length >= 8) {
        // May be our merchant reference — try with prefix variants
        if (fallbackPrefix === 'sp' && !c.startsWith('sp_')) {
          // Prefer exact match first; PaymentsService looks up by providerRef stored at initiate time
        }
        return c.startsWith('sp_') || c.startsWith('at_') ? c : c;
      }
    }
    const raw = candidates[0];
    if (!raw) return undefined;
    if (raw.startsWith('sp_') || raw.startsWith('at_')) return raw;
    return `${fallbackPrefix}_${raw}`;
  }

  private extractOutcome(payload: Record<string, unknown>): 'COMPLETED' | 'FAILED' | null {
    const nested = asRecord(payload.data ?? payload.payload ?? payload.result ?? {});
    return (
      normalizeOutcome(pickString(payload, ['status', 'transactionStatus', 'paymentStatus', 'state', 'resultCode'])) ??
      normalizeOutcome(pickString(nested, ['status', 'transactionStatus', 'paymentStatus', 'state', 'resultCode']))
    );
  }

  @Post('webhooks/serdipay')
  @ApiOperation({ summary: 'Webhook SerdiPay Mobile Money (public)' })
  async serdiPay(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: { rawBody?: Buffer },
  ) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});
    if (!this.verifySerdiPaySignature(raw, headers)) {
      this.logger.warn('SerdiPay webhook: signature invalide');
      return { success: false, message: 'Signature invalide' };
    }
    const payload = asRecord(body);
    const providerRef = this.extractProviderRef(payload, 'sp');
    const outcome = this.extractOutcome(payload) ?? 'COMPLETED';
    if (!providerRef) {
      this.logger.warn(`SerdiPay webhook sans référence: ${raw.slice(0, 300)}`);
      return { success: false, message: 'Référence manquante' };
    }
    this.logger.log(`SerdiPay webhook ${outcome} ref=${providerRef}`);
    return this.payments.completeMobileMoneyFromWebhook(
      providerRef,
      outcome,
      pickString(payload, ['message', 'description', 'failureReason']),
    );
  }

  @Post('africastalking/callback')
  @ApiOperation({ summary: 'Callback Africa\'s Talking Mobile Money (public)' })
  async africasTalking(@Body() body: unknown) {
    const payload = asRecord(body);
    const providerRef = this.extractProviderRef(payload, 'at');
    const outcome = this.extractOutcome(payload) ?? 'COMPLETED';
    if (!providerRef) {
      this.logger.warn(`AT callback sans référence: ${JSON.stringify(body).slice(0, 300)}`);
      return { success: false, message: 'Référence manquante' };
    }
    this.logger.log(`Africa's Talking callback ${outcome} ref=${providerRef}`);
    return this.payments.completeMobileMoneyFromWebhook(
      providerRef,
      outcome,
      pickString(payload, ['description', 'message', 'failureReason']),
    );
  }
}
