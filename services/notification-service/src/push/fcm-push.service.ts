import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FcmPushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class FcmPushService {
  private readonly logger = new Logger(FcmPushService.name);

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('FCM_SERVER_KEY')?.trim());
  }

  async sendToTokens(tokens: string[], message: FcmPushMessage): Promise<void> {
    const serverKey = this.config.get<string>('FCM_SERVER_KEY')?.trim();
    if (!serverKey || tokens.length === 0) return;

    const unique = [...new Set(tokens.filter(Boolean))];
    const data = Object.fromEntries(
      Object.entries(message.data ?? {}).map(([k, v]) => [k, String(v)]),
    );

    await Promise.all(
      unique.map(async (token) => {
        try {
          const res = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              Authorization: `key=${serverKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: token,
              priority: 'high',
              content_available: true,
              notification: {
                title: message.title,
                body: message.body,
                sound: 'default',
                android_channel_id: 'mova_driver_jobs',
              },
              data: {
                ...data,
                title: message.title,
                body: message.body,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
              },
            }),
          });
          if (!res.ok) {
            const text = await res.text();
            this.logger.warn(`FCM push failed (${res.status}) token=${token.slice(0, 12)}… ${text}`);
          }
        } catch (e) {
          this.logger.warn(`FCM push error token=${token.slice(0, 12)}…`, e);
        }
      }),
    );
  }
}
