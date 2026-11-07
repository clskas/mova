import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, formatMovaPublicId } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  isFinalSmileIdStatus,
  smileIdBaseUrl,
  smileIdConfig,
  smileIdLinkIdTypes,
  smileIdWebhookIds,
  summarizeSmileIdResult,
  verifySmileIdSignature,
  type SmileIdConfig,
} from './smile-id';

/** A link is reused while it is younger than this (Smile ID keeps single-use links 90 days). */
const LINK_REUSE_MS = 80 * 24 * 3600 * 1000;

@Injectable()
export class SmileIdService {
  private readonly logger = new Logger(SmileIdService.name);

  constructor(private prisma: PrismaService) {}

  configured(): boolean {
    return smileIdConfig() != null;
  }

  private requireConfig(): SmileIdConfig {
    const config = smileIdConfig();
    if (!config) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.SERVICE_UNAVAILABLE,
        'Smile ID n’est pas configuré (SMILE_ID_PARTNER_ID / SMILE_ID_API_KEY manquants sur driver-service).',
      );
    }
    return config;
  }

  private async smileError(res: Response, what: string): Promise<never> {
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      detail = body.message ?? body.error ?? '';
    } catch {
      /* not JSON */
    }
    this.logger.warn(`Smile ID ${what} failed: ${res.status} ${detail}`);
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      HttpStatus.BAD_GATEWAY,
      `Smile ID a refusé la demande (${what}, ${res.status})${detail ? ` : ${detail}` : ''}.`,
    );
  }

  /** Short-lived (15 min) token for the v3 API. */
  private async token(config: SmileIdConfig): Promise<string> {
    const form = new FormData();
    form.append('partner_id', config.partnerId);
    const res = await fetch(`${smileIdBaseUrl(config.env)}/v3/token`, {
      method: 'POST',
      headers: { 'smileid-partner-id': config.partnerId, 'smileid-api-key': config.apiKey, Accept: 'application/json' },
      body: form,
    });
    if (!res.ok) await this.smileError(res, 'jeton');
    const body = (await res.json()) as { token?: string };
    if (!body.token) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_GATEWAY, 'Smile ID : jeton absent.');
    return body.token;
  }

  private authHeaders(config: SmileIdConfig, token: string) {
    return { 'SmileID-Partner-ID': config.partnerId, 'SmileID-Token': token, Accept: 'application/json' };
  }

  /** Latest verification of a driver, for the admin file. */
  async latest(userId: string) {
    const row = await this.prisma.smileIdVerification.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return { configured: this.configured(), env: smileIdConfig()?.env ?? null, verification: row };
  }

  /**
   * Single-use Smile ID link for one driver: the driver opens it on the phone, photographs the
   * DRC document (voter card, passport or licence) and takes a live selfie. The verdict comes
   * back on the webhook. An unused recent link is reused instead of creating a new one.
   */
  async createLink(userId: string, opts: { force?: boolean } = {}) {
    const config = this.requireConfig();
    const existing = await this.prisma.smileIdVerification.findFirst({
      where: { userId, status: 'PENDING', env: config.env },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && !opts.force && Date.now() - existing.createdAt.getTime() < LINK_REUSE_MS) {
      return existing;
    }
    const token = await this.token(config);
    const form = new FormData();
    form.append('id_types', JSON.stringify(smileIdLinkIdTypes()));
    form.append('name', `SENGA chauffeur ${formatMovaPublicId(userId, 'DRIVER')}`.slice(0, 120));
    form.append('notice_privacy_policy_url', config.privacyPolicyUrl);
    form.append('is_single_use', 'true');
    form.append('callback_url', config.callbackUrl);
    if (config.redirectUrl) form.append('redirect_url', config.redirectUrl);
    form.append('partner_params', JSON.stringify({ senga_user_id: userId }));
    const res = await fetch(`${smileIdBaseUrl(config.env)}/v3/smile_links`, {
      method: 'POST',
      headers: this.authHeaders(config, token),
      body: form,
    });
    if (!res.ok) await this.smileError(res, 'création du lien');
    const created = (await res.json()) as { link?: string; ref_id?: string; user_id?: string | null };
    if (!created.link || !created.ref_id) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_GATEWAY, 'Smile ID : lien absent de la réponse.');
    }
    return this.prisma.smileIdVerification.create({
      data: {
        userId,
        env: config.env,
        refId: created.ref_id,
        smileUserId: created.user_id ?? null,
        link: created.link,
        status: 'PENDING',
      },
    });
  }

  /** Result pushed by Smile ID. */
  async handleWebhook(
    headers: Record<string, unknown>,
    payload: Record<string, unknown>,
  ): Promise<'ok' | 'bad_signature' | 'unknown'> {
    const config = smileIdConfig();
    if (!config) return 'bad_signature';
    const h = (name: string) => {
      const v = headers[name];
      return typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined;
    };
    if (!verifySmileIdSignature(config, h('response-timestamp'), h('response-signature'))) {
      this.logger.warn('Smile ID webhook: invalid signature');
      return 'bad_signature';
    }
    const ids = smileIdWebhookIds(headers, payload);
    const or: Prisma.SmileIdVerificationWhereInput[] = [];
    if (ids.smileUserId) or.push({ smileUserId: ids.smileUserId });
    if (ids.jobId) or.push({ jobId: ids.jobId });
    let row = or.length
      ? await this.prisma.smileIdVerification.findFirst({ where: { OR: or }, orderBy: { createdAt: 'desc' } })
      : null;
    if (!row && ids.sengaUserId) {
      row = await this.prisma.smileIdVerification.findFirst({
        where: { userId: ids.sengaUserId, env: config.env },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (!row) {
      this.logger.warn(`Smile ID webhook: no verification for user ${ids.smileUserId ?? '?'} / job ${ids.jobId ?? '?'}`);
      return 'unknown';
    }
    const result = summarizeSmileIdResult(payload);
    await this.prisma.smileIdVerification.update({
      where: { id: row.id },
      data: {
        status: result.status ?? 'error',
        jobId: ids.jobId ?? row.jobId,
        smileUserId: row.smileUserId ?? ids.smileUserId,
        message: result.message,
        reason: result.reason,
        result: result as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    return 'ok';
  }

  /** Asks Smile ID again for the verdict (when a webhook was missed). */
  async refresh(userId: string) {
    const config = this.requireConfig();
    const row = await this.prisma.smileIdVerification.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    if (!row?.jobId) return this.latest(userId);
    const token = await this.token(config);
    const res = await fetch(`${smileIdBaseUrl(config.env)}/v3/status/${encodeURIComponent(row.jobId)}`, {
      headers: this.authHeaders(config, token),
    });
    if (res.status !== 200 && res.status !== 202) await this.smileError(res, 'statut');
    const body = (await res.json()) as { status?: string; message?: string };
    if (body.status && body.status !== row.status && (isFinalSmileIdStatus(body.status) || body.status === 'processing')) {
      await this.prisma.smileIdVerification.update({
        where: { id: row.id },
        data: {
          status: body.status,
          message: body.message ?? row.message,
          completedAt: isFinalSmileIdStatus(body.status) ? row.completedAt ?? new Date() : row.completedAt,
        },
      });
    }
    return this.latest(userId);
  }
}
