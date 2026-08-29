import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  afrisoftHubWebhookSecret,
  afrisoftPayHubVerifySignature,
  cinetPayCheckTransaction,
  cinetPayVerifyXToken,
  isAfrisoftPayHubMode,
  isCinetPayConfigured,
} from '@mova/shared';
import { PaymentsService } from './payments.service';
import { HubPaymentsService } from '../hub/hub-payments.service';
import {
  asRecord,
  extractAggregatorOutcome,
  extractAggregatorProviderRef,
  pickString,
} from './provider-ref.util';

@ApiTags('payments-webhooks')
@Controller('payments')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    private payments: PaymentsService,
    private config: ConfigService,
    private hub: HubPaymentsService,
  ) {}

  /** Aggregator callbacks (SerdiPay / CinetPay / AT) belong on the VPS hub only. */
  private isHubProcess(): boolean {
    return isAfrisoftPayHubMode((key) => this.config.get<string>(key));
  }

  private rejectAggregatorOnSenga(name: string) {
    this.logger.warn(`${name} webhook rejected on SENGA — use POST /api/payments/webhooks/afrisoft-hub`);
    return { success: false, message: 'Webhook agrégateur non accepté ici' };
  }

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

  @Post('webhooks/serdipay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook SerdiPay Mobile Money (public)' })
  async serdiPay(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: { rawBody?: Buffer },
  ) {
    if (!this.isHubProcess()) return this.rejectAggregatorOnSenga('SerdiPay');
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});
    if (!this.verifySerdiPaySignature(raw, headers)) {
      this.logger.warn('SerdiPay webhook: signature invalide');
      return { success: false, message: 'Signature invalide' };
    }
    const payload = asRecord(body);
    const providerRef = extractAggregatorProviderRef(payload);
    const outcome = extractAggregatorOutcome(payload);
    if (!outcome) {
      this.logger.log(`SerdiPay webhook pending (102/unknown) ref=${providerRef ?? '?'}`);
      return { success: true, message: 'Transaction en cours' };
    }
    if (!providerRef) {
      this.logger.warn(`SerdiPay webhook sans référence: ${raw.slice(0, 300)}`);
      return { success: true, message: 'Référence manquante' };
    }
    this.logger.log(`SerdiPay webhook ${outcome} ref=${providerRef}`);
    const failure = pickString(payload, ['message', 'description', 'failureReason']);
    if (this.hub.isEnabled()) {
      const hubResult = await this.hub.finalizeFromAggregator(providerRef, outcome, failure);
      if (hubResult.found) return { success: true, ...hubResult };
    }
    const result = await this.payments.completeMobileMoneyFromWebhook(providerRef, outcome, failure);
    if (!result.success) {
      this.logger.warn(`SerdiPay webhook unknown ref=${providerRef} — ACK 200 (no retry storm)`);
      return { success: true, message: result.message ?? 'Référence inconnue (ack)' };
    }
    return result;
  }

  @Post('africastalking/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Callback Africa\'s Talking Mobile Money (public)' })
  async africasTalking(@Body() body: unknown) {
    if (!this.isHubProcess()) return this.rejectAggregatorOnSenga("Africa's Talking");
    const payload = asRecord(body);
    const providerRef = extractAggregatorProviderRef(payload);
    const outcome = extractAggregatorOutcome(payload) ?? 'COMPLETED';
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
    if (!this.isHubProcess()) return this.rejectAggregatorOnSenga('CinetPay');
    return { success: true, message: 'ok' };
  }

  @Post('webhooks/cinetpay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook CinetPay Mobile Money (public)' })
  async cinetPay(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    if (!this.isHubProcess()) return this.rejectAggregatorOnSenga('CinetPay');
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
    if (this.hub.isEnabled()) {
      const hubResult = await this.hub.finalizeFromAggregator(
        providerRef,
        outcome,
        checked.message ?? pickString(payload, ['cpm_error_message', 'message']),
      );
      if (hubResult.found) return { success: true, ...hubResult };
    }
    return this.payments.completeMobileMoneyFromWebhook(
      providerRef,
      outcome,
      checked.message ?? pickString(payload, ['cpm_error_message', 'message']),
    );
  }

  /**
   * Hub AfriSoft → SENGA (Render). SerdiPay never POSTs here.
   * Public: POST /api/payments/webhooks/afrisoft-hub
   */
  @Post('webhooks/afrisoft-hub')
  @ApiOperation({ summary: 'Webhook sortant hub AfriSoft (crédit wallet SENGA)' })
  async afrisoftHub(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: { rawBody?: string; originalUrl?: string; url?: string },
  ) {
    return this.handleAfriSoftHubWebhook(body, headers, req);
  }

  @Post('webhooks/afrisoft-pay')
  @ApiOperation({ summary: 'Alias webhook hub AfriSoft' })
  async afrisoftPayAlias(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: { rawBody?: string; originalUrl?: string; url?: string },
  ) {
    return this.handleAfriSoftHubWebhook(body, headers, req);
  }

  private handleAfriSoftHubWebhook(
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
    req: { rawBody?: string; originalUrl?: string; url?: string },
  ) {
    const get = (key: string) => this.config.get<string>(key);
    const secret = afrisoftHubWebhookSecret(get);
    const timestamp = typeof headers['x-afrisoft-timestamp'] === 'string' ? headers['x-afrisoft-timestamp'] : '';
    const signature = typeof headers['x-afrisoft-signature'] === 'string' ? headers['x-afrisoft-signature'] : '';
    const raw = req.rawBody ?? JSON.stringify(body ?? {});
    const path = (req.originalUrl ?? req.url ?? '/api/payments/webhooks/afrisoft-hub').split('?')[0];
    if (!secret || !afrisoftPayHubVerifySignature({ secret, timestamp, method: 'POST', path, rawBody: raw, signature })) {
      this.logger.warn('AfriSoft hub webhook: signature invalide');
      return { success: false, message: 'Signature invalide' };
    }
    const payload = asRecord(body);
    const statusRaw = pickString(payload, ['status'])?.toUpperCase();
    const outcome =
      statusRaw === 'COMPLETED' || statusRaw === 'FAILED'
        ? statusRaw
        : payload.event === 'payment.failed'
          ? 'FAILED'
          : 'COMPLETED';
    const paymentId = pickString(payload, ['payment_id', 'paymentId']);
    const providerRef = pickString(payload, ['provider_ref', 'providerRef']) ?? paymentId;
    const reference = pickString(payload, ['reference']);
    if (!providerRef && !paymentId && !reference) {
      return { success: false, message: 'Référence manquante' };
    }
    this.logger.log(`AfriSoft hub webhook ${outcome} payment=${paymentId ?? '?'} provider=${providerRef ?? '?'}`);
    return this.payments.completeMobileMoneyFromWebhook(
      providerRef ?? paymentId ?? reference ?? '',
      outcome,
      pickString(payload, ['failure_reason', 'message']),
      [paymentId ?? '', reference ?? ''],
    );
  }
}
