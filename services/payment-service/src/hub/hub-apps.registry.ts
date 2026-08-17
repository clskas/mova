import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type HubAppConfig = {
  appId: string;
  apiKey: string;
  webhookUrl?: string;
  webhookSecret?: string;
};

/**
 * App registry from VPS env (never commit values):
 *   AFRISOFT_HUB_APPS=senga:<api_key>,educongo:<api_key>
 *   AFRISOFT_HUB_WEBHOOK_URL_SENGA=https://api.afri-soft.com/api/payments/webhooks/afrisoft-hub
 *   AFRISOFT_HUB_WEBHOOK_SECRET_SENGA=<hmac secret>
 */
@Injectable()
export class HubAppsRegistry implements OnModuleInit {
  private readonly logger = new Logger(HubAppsRegistry.name);
  private readonly apps = new Map<string, HubAppConfig>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>('AFRISOFT_HUB_APPS')?.trim() || '';
    for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      const idx = part.indexOf(':');
      if (idx <= 0) continue;
      const appId = part.slice(0, idx).trim().toLowerCase();
      const apiKey = part.slice(idx + 1).trim();
      if (appId && apiKey) {
        this.apps.set(appId, {
          appId,
          apiKey,
          webhookUrl: this.envWebhookUrl(appId),
          webhookSecret: this.envWebhookSecret(appId) || apiKey,
        });
      }
    }
    if (this.apps.size === 0) {
      const senga = this.config.get<string>('APP_KEY_SENGA')?.trim();
      if (senga) {
        this.apps.set('senga', {
          appId: 'senga',
          apiKey: senga,
          webhookUrl: this.envWebhookUrl('senga'),
          webhookSecret: this.envWebhookSecret('senga') || senga,
        });
      }
    }
    const names = [...this.apps.keys()];
    this.logger.log(`Pay hub apps registered: ${names.join(', ') || '(none)'}`);
    for (const app of this.apps.values()) {
      this.logger.log(
        `Pay hub app ${app.appId}: webhook_url=${app.webhookUrl ? 'SET' : 'EMPTY'} webhook_secret=${app.webhookSecret ? 'SET' : 'EMPTY'}`,
      );
    }
  }

  private envWebhookUrl(appId: string): string | undefined {
    const key = `AFRISOFT_HUB_WEBHOOK_URL_${appId.toUpperCase()}`;
    const explicit = this.config.get<string>(key)?.trim();
    if (explicit) return explicit;
    if (appId === 'senga') {
      return 'https://api.afri-soft.com/api/payments/webhooks/afrisoft-hub';
    }
    return undefined;
  }

  private envWebhookSecret(appId: string): string | undefined {
    const key = `AFRISOFT_HUB_WEBHOOK_SECRET_${appId.toUpperCase()}`;
    return this.config.get<string>(key)?.trim() || undefined;
  }

  get(appId: string): HubAppConfig | undefined {
    return this.apps.get(appId.trim().toLowerCase());
  }

  getApiKey(appId: string): string | undefined {
    return this.get(appId)?.apiKey;
  }

  isEnabled(): boolean {
    return (
      this.apps.size > 0 ||
      (this.config.get<string>('AFRISOFT_PAY_HUB_MODE') ?? '').trim().toLowerCase() === 'true'
    );
  }

  listAppIds(): string[] {
    return [...this.apps.keys()];
  }
}
