import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PushTokensService } from './push-tokens.service';

export type WebPushMessage = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  data?: Record<string, string>;
};

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private configured = false;

  constructor(
    private config: ConfigService,
    private pushTokens: PushTokensService,
  ) {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const subject = this.config.get<string>('VAPID_SUBJECT')?.trim() ?? 'mailto:contact@mova.cd';
    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.configured = true;
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY')?.trim() || null;
  }

  async sendToUsers(
    userIds: string[],
    appFlavor: string,
    message: WebPushMessage,
  ): Promise<number> {
    if (!this.configured || userIds.length === 0) return 0;
    const tokens = await this.pushTokens.tokensForUsers(userIds, appFlavor);
    if (tokens.length === 0) return 0;

    let sent = 0;
    for (const token of tokens) {
      const ok = await this.sendSubscription(token, message);
      if (ok) sent++;
    }
    return sent;
  }

  private async sendSubscription(token: string, message: WebPushMessage): Promise<boolean> {
    let subscription: webpush.PushSubscription;
    try {
      subscription = JSON.parse(token) as webpush.PushSubscription;
      if (!subscription?.endpoint) return false;
    } catch {
      return false;
    }

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      tag: message.tag,
      url: message.url ?? '/',
      data: message.data ?? {},
    });

    try {
      await webpush.sendNotification(subscription, payload, { TTL: 3600 });
      return true;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await this.pushTokens.removeToken(token).catch(() => undefined);
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Web push failed (${status ?? 'error'}): ${msg.slice(0, 120)}`);
      return false;
    }
  }
}
