import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
  afrisoftHubPublicPath,
  afrisoftPayHubOperator,
  afrisoftPayHubSign,
  cinetPayInitiateMobileMoney,
  isCinetPayConfigured,
  isSerdiPayPaymentConfigured,
  serdiPayDisburseMobileMoney,
  serdiPayInitiateMobileMoney,
  serdiPayNormalizePhone,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { HubAppsRegistry } from './hub-apps.registry';
import { CreateHubPaymentDto } from './hub-payments.dto';

type HubKind = 'COLLECT' | 'PAYOUT';

@Injectable()
export class HubPaymentsService {
  private readonly logger = new Logger(HubPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly apps: HubAppsRegistry,
  ) {}

  isEnabled(): boolean {
    return this.apps.isEnabled();
  }

  private envGetter = (key: string) => this.config.get<string>(key);

  private newPaymentId(): string {
    return `pay_${randomBytes(12).toString('hex')}`;
  }

  private toView(row: {
    id: string;
    status: string;
    reference: string;
    providerRef: string | null;
    amountCdf: number;
    completedAt: Date | null;
    failureReason: string | null;
    telecom: string;
    metadata?: unknown;
  }) {
    const meta = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {};
    const paymentUrl = typeof meta.paymentUrl === 'string' ? meta.paymentUrl : undefined;
    return {
      payment_id: row.id,
      status: row.status,
      reference: row.reference,
      provider_ref: row.providerRef ?? undefined,
      amount_cdf: row.amountCdf,
      telecom: row.telecom,
      completed_at: row.completedAt?.toISOString() ?? null,
      message: row.failureReason ?? undefined,
      ...(paymentUrl ? { paymentUrl } : {}),
    };
  }

  async createCollect(appId: string, dto: CreateHubPaymentDto) {
    return this.create(appId, dto, 'COLLECT');
  }

  async createPayout(appId: string, dto: CreateHubPaymentDto) {
    return this.create(appId, dto, 'PAYOUT');
  }

  private async create(appId: string, dto: CreateHubPaymentDto, kind: HubKind) {
    if (dto.app_id.trim().toLowerCase() !== appId) {
      throw new HttpException({ message: 'app_id mismatch', code: 'HUB_APP_MISMATCH' }, HttpStatus.FORBIDDEN);
    }
    if ((dto.currency || 'CDF').toUpperCase() !== 'CDF') {
      throw new HttpException({ message: 'currency CDF uniquement', code: 'HUB_CURRENCY' }, HttpStatus.BAD_REQUEST);
    }

    const idem = dto.idempotency_key?.trim();
    if (idem) {
      const existing = await this.prisma.hubPayment.findFirst({
        where: { appId, idempotencyKey: idem },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return { statusCode: HttpStatus.OK, body: this.toView(existing) };
    }

    const dup = await this.prisma.hubPayment.findUnique({
      where: { appId_reference: { appId, reference: dto.reference } },
    });
    if (dup) return { statusCode: HttpStatus.OK, body: this.toView(dup) };

    const gateway = (this.config.get<string>('MOBILE_MONEY_GATEWAY') ?? 'serdipay').trim().toLowerCase();
    const operator = afrisoftPayHubOperator(dto.telecom);
    const phone = serdiPayNormalizePhone(dto.phone);
    const purpose = dto.purpose?.trim() || (kind === 'PAYOUT' ? 'withdraw' : 'pay');

    let mm: {
      success: boolean;
      providerRef?: string;
      paymentUrl?: string;
      message?: string;
    };

    if (gateway === 'cinetpay') {
      if (!isCinetPayConfigured(this.envGetter)) {
        throw new HttpException(
          { message: 'CinetPay non configuré sur le hub.', code: 'HUB_GATEWAY' },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (kind === 'PAYOUT') {
        throw new HttpException(
          { message: 'Retraits CinetPay non supportés sur le hub.', code: 'HUB_PAYOUT_UNSUPPORTED' },
          HttpStatus.BAD_REQUEST,
        );
      }
      mm = await cinetPayInitiateMobileMoney(this.envGetter, {
        operator,
        amountCdf: dto.amount_cdf,
        phone,
        reference: dto.reference,
      });
    } else {
      if (!isSerdiPayPaymentConfigured(this.envGetter)) {
        throw new HttpException(
          { message: 'SerdiPay non configuré sur le hub VPS.', code: 'HUB_GATEWAY' },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      mm =
        kind === 'PAYOUT'
          ? await serdiPayDisburseMobileMoney(this.envGetter, {
              operator,
              amountCdf: dto.amount_cdf,
              phone,
              reference: dto.reference,
            })
          : await serdiPayInitiateMobileMoney(this.envGetter, {
              operator,
              amountCdf: dto.amount_cdf,
              phone,
              reference: dto.reference,
            });
    }

    if (!mm.success) {
      throw new HttpException(
        { message: mm.message ?? 'Échec initiation Mobile Money', code: 'HUB_PROVIDER_FAILED' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const id = this.newPaymentId();
    const metadata = {
      ...(dto.metadata ?? {}),
      ...(mm.paymentUrl ? { paymentUrl: mm.paymentUrl } : {}),
    };
    const row = await this.prisma.hubPayment.create({
      data: {
        id,
        appId,
        kind,
        reference: dto.reference,
        purpose,
        amountCdf: dto.amount_cdf,
        currency: 'CDF',
        phone,
        telecom: dto.telecom,
        status: 'PENDING',
        providerRef: mm.providerRef ?? id,
        idempotencyKey: idem || null,
        metadata,
      },
    });
    this.logger.log(`Hub ${kind} ${id} app=${appId} ref=${dto.reference} provider=${row.providerRef}`);
    return {
      statusCode: HttpStatus.CREATED,
      body: {
        ...this.toView(row),
        message: mm.message ?? 'Confirmez le paiement sur votre téléphone Mobile Money.',
      },
    };
  }

  async getById(appId: string, paymentId: string) {
    const row = await this.prisma.hubPayment.findUnique({ where: { id: paymentId } });
    if (!row || row.appId !== appId) {
      throw new HttpException({ message: 'Paiement introuvable', code: 'HUB_NOT_FOUND' }, HttpStatus.NOT_FOUND);
    }
    return this.toView(row);
  }

  async getByReference(appId: string, reference: string) {
    const row = await this.prisma.hubPayment.findUnique({
      where: { appId_reference: { appId, reference } },
    });
    if (!row) {
      throw new HttpException({ message: 'Paiement introuvable', code: 'HUB_NOT_FOUND' }, HttpStatus.NOT_FOUND);
    }
    return this.toView(row);
  }

  async finalizeFromAggregator(
    providerRef: string,
    outcome: 'COMPLETED' | 'FAILED',
    message?: string,
  ): Promise<{ found: boolean; notified?: boolean; payment_id?: string; status?: string }> {
    const ref = providerRef.trim();
    if (!ref) return { found: false };

    const row =
      (await this.prisma.hubPayment.findFirst({
        where: { OR: [{ providerRef: ref }, { id: ref }, { reference: ref }] },
        orderBy: { updatedAt: 'desc' },
      })) ?? null;
    if (!row) return { found: false };

    if (row.status === 'COMPLETED' || row.status === 'FAILED') {
      if (!row.notifiedAt) {
        const notified = await this.notifyApp(row.id);
        return { found: true, notified, payment_id: row.id, status: row.status };
      }
      return { found: true, notified: true, payment_id: row.id, status: row.status };
    }

    const updated = await this.prisma.hubPayment.update({
      where: { id: row.id },
      data: {
        status: outcome,
        failureReason: outcome === 'FAILED' ? message ?? 'Paiement Mobile Money refusé' : null,
        completedAt: outcome === 'COMPLETED' ? new Date() : row.completedAt,
      },
    });
    const notified = await this.notifyApp(updated.id);
    return { found: true, notified, payment_id: updated.id, status: updated.status };
  }

  async notifyApp(paymentId: string): Promise<boolean> {
    const row = await this.prisma.hubPayment.findUnique({ where: { id: paymentId } });
    if (!row) return false;
    const app = this.apps.get(row.appId);
    if (!app?.webhookUrl) {
      this.logger.warn(`Hub notify skipped: webhook_url empty for app=${row.appId}`);
      return false;
    }
    const event = row.status === 'FAILED' ? 'payment.failed' : 'payment.completed';
    const payload = {
      event,
      payment_id: row.id,
      app_id: row.appId,
      status: row.status,
      reference: row.reference,
      provider_ref: row.providerRef,
      amount_cdf: row.amountCdf,
      currency: row.currency,
      phone: row.phone,
      telecom: row.telecom,
      purpose: row.purpose,
      metadata: row.metadata ?? {},
      occurred_at: (row.completedAt ?? new Date()).toISOString(),
      ...(row.failureReason ? { failure_reason: row.failureReason } : {}),
    };
    const rawBody = JSON.stringify(payload);
    let url: URL;
    try {
      url = new URL(app.webhookUrl);
    } catch {
      this.logger.warn(`Hub notify invalid webhook_url for app=${row.appId}`);
      return false;
    }
    const path = afrisoftHubPublicPath(url.pathname);
    const secret = app.webhookSecret || app.apiKey;
    if (!app.webhookSecret) {
      this.logger.warn(`Hub notify: webhook_secret empty for app=${row.appId} — signing with api_key`);
    }

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const ts = Math.floor(Date.now() / 1000).toString();
      const signature = afrisoftPayHubSign({
        apiKey: secret,
        timestamp: ts,
        method: 'POST',
        path,
        rawBody,
      });
      try {
        const res = await fetch(app.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AfriSoft-App-Id': row.appId,
            'X-AfriSoft-Event': event,
            'X-AfriSoft-Timestamp': ts,
            'X-AfriSoft-Signature': signature,
          },
          body: rawBody,
        });
        if (res.ok) {
          await this.prisma.hubPayment.update({
            where: { id: row.id },
            data: { notifiedAt: new Date() },
          });
          this.logger.log(`Hub notify ${event} ${row.id} → ${row.appId} HTTP ${res.status}`);
          return true;
        }
        this.logger.warn(`Hub notify ${row.id} attempt ${attempt} HTTP ${res.status}`);
      } catch (e) {
        this.logger.warn(`Hub notify ${row.id} attempt ${attempt} failed: ${(e as Error).message}`);
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    return false;
  }
}
