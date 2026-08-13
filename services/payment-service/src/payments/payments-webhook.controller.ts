import { Body, Controller, Get, Headers, Logger, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  cinetPayCheckTransaction,
  cinetPayVerifyXToken,
  isCinetPayConfigured,
} from '@mova/shared';
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
    // SerdiPay Public API callback: { message, payment: { status, sessionId, transactionId } }
    const nested = asRecord(
      payload.data ?? payload.payload ?? payload.result ?? payload.payment ?? {},
    );
    const candidates = [
      pickString(payload, ['providerRef', 'provider_ref', 'externalId', 'external_id', 'transactionId', 'transaction_id', 'txnId', 'id']),
      pickString(nested, ['providerRef', 'provider_ref', 'externalId', 'external_id', 'transactionId', 'transaction_id', 'txnId', 'sessionId', 'id']),
      pickString(payload, ['reference', 'merchantReference', 'clientReference', 'metadata', 'message']),
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
    const nested = asRecord(
      payload.data ?? payload.payload ?? payload.result ?? payload.payment ?? {},
    );
    // SerdiPay may send top-level status as HTTP-like number (200 / 402)
    const topStatus = payload.status;
    if (typeof topStatus === 'number') {
      if (topStatus === 200) return 'COMPLETED';
      if (topStatus === 102) return null; // still processing — ignore until final callback
      if ([400, 401, 402, 403, 409, 429].includes(topStatus)) return 'FAILED';
    }
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
    const outcome = this.extractOutcome(payload);
    if (!outcome) {
      this.logger.log(`SerdiPay webhook pending (102/unknown) ref=${providerRef ?? '?'}`);
      return { success: true, message: 'Transaction en cours' };
    }
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

  /**
   * CinetPay notify_url — GET ping (availability) + POST form-urlencoded.
   * Public hub path: https://pay.afri-soft.com/webhooks/cinetpay
   * (Caddy rewrites → /api/payments/webhooks/cinetpay)
   */
  @Get('webhooks/cinetpay')
  @ApiOperation({ summary: 'Ping CinetPay notify_url (GET)' })
  cinetPayPing() {
    return { success: true, message: 'ok' };
  }

  @Post('webhooks/cinetpay')
  @ApiOperation({ summary: 'Webhook CinetPay Mobile Money (public)' })
  async cinetPay(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const payload = asRecord(body);
    const transId =
      pickString(payload, ['cpm_trans_id', 'transaction_id', 'transactionId']) ?? '';
    if (!transId) {
      this.logger.warn(`CinetPay webhook sans cpm_trans_id: ${JSON.stringify(body).slice(0, 300)}`);
      return { success: false, message: 'Référence manquante' };
    }

    const secret = this.config.get<string>('CINETPAY_SECRET_KEY')?.trim();
    const xTokenHeader = headers['x-token'];
    const xToken = typeof xTokenHeader === 'string' ? xTokenHeader : Array.isArray(xTokenHeader) ? xTokenHeader[0] : '';
    if (secret) {
      if (!xToken || !cinetPayVerifyXToken(secret, payload, xToken)) {
        this.logger.warn(`CinetPay webhook: x-token HMAC invalide trans=${transId}`);
        return { success: false, message: 'Signature invalide' };
      }
    } else {
      this.logger.warn('CINETPAY_SECRET_KEY unset — webhook accepted; status verified via check API');
    }

    const get = (key: string) => this.config.get<string>(key);
    if (!isCinetPayConfigured(get)) {
      this.logger.warn('CinetPay webhook reçu mais CINETPAY_API_KEY / SITE_ID absents');
      return { success: false, message: 'CinetPay non configuré' };
    }

    // Always re-check (CinetPay security guidance — do not trust notify body status alone)
    const checked = await cinetPayCheckTransaction(get, transId);
    if (checked.status === 'PENDING' || checked.status === 'UNKNOWN') {
      this.logger.log(`CinetPay webhook pending/unknown trans=${transId} status=${checked.status}`);
      return { success: true, message: 'Transaction en cours' };
    }

    const outcome = checked.status === 'ACCEPTED' ? 'COMPLETED' : 'FAILED';
    const providerRef = transId.startsWith('cp_') ? transId : `cp_${transId}`;
    this.logger.log(`CinetPay webhook ${outcome} ref=${providerRef}`);
    return this.payments.completeMobileMoneyFromWebhook(
      providerRef,
      outcome,
      checked.message ?? pickString(payload, ['cpm_error_message', 'message']),
    );
  }
}
