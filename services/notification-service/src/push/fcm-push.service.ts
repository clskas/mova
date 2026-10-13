import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FcmPushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export type FcmPushProfile = 'job' | 'chat';

/** Canal + son SENGA (doit matcher DriverJobAlertService côté app — v5). */
export const SENGA_DRIVER_JOB_CHANNEL = 'mova_driver_jobs_v5';
/** Android raw `senga_job` ; iOS bundle `senga_job.wav` (extension requise pour APNs). */
export const SENGA_DRIVER_JOB_SOUND_ANDROID = 'senga_job';
export const SENGA_DRIVER_JOB_SOUND_IOS = 'senga_job.wav';

/** Canal chat (ChatAlertService sur passager + chauffeur). Son système. */
export const SENGA_CHAT_CHANNEL = 'mova_chat';

@Injectable()
export class FcmPushService {
  private readonly logger = new Logger(FcmPushService.name);

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('FCM_SERVER_KEY')?.trim());
  }

  async sendToTokens(
    tokens: string[],
    message: FcmPushMessage,
    opts?: { profile?: FcmPushProfile },
  ): Promise<void> {
    const serverKey = this.config.get<string>('FCM_SERVER_KEY')?.trim();
    if (!serverKey || tokens.length === 0) return;

    const unique = [...new Set(tokens.filter(Boolean))];
    const data = Object.fromEntries(
      Object.entries(message.data ?? {}).map(([k, v]) => [k, String(v)]),
    );
    const profile = opts?.profile ?? 'job';
    const isChat = profile === 'chat';
    const channelId = isChat ? SENGA_CHAT_CHANNEL : SENGA_DRIVER_JOB_CHANNEL;
    const soundAndroid = isChat ? 'default' : SENGA_DRIVER_JOB_SOUND_ANDROID;
    const soundIos = isChat ? 'default' : SENGA_DRIVER_JOB_SOUND_IOS;

    await Promise.all(
      unique.map(async (token) => {
        try {
          // Legacy FCM HTTP API — android_channel_id + sound (raw resource / iOS bundle)
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
              // Legacy HTTP: wake device even if app is killed (high priority + notification block).
              notification: {
                title: message.title,
                body: message.body,
                sound: soundIos,
                android_channel_id: channelId,
                ...(isChat
                  ? {}
                  : {
                      click_action: 'FLUTTER_NOTIFICATION_CLICK',
                      tag: data.referenceId ? `job:${data.referenceId}` : 'senga_job',
                    }),
              },
              android: {
                priority: 'high',
                notification: {
                  channel_id: channelId,
                  sound: soundAndroid,
                  ...(isChat
                    ? {}
                    : {
                        default_vibrate_timings: true,
                        notification_priority: 'PRIORITY_MAX',
                        visibility: 'PUBLIC',
                      }),
                },
              },
              apns: {
                headers: {
                  'apns-priority': '10',
                  ...(isChat ? {} : { 'apns-push-type': 'alert' }),
                },
                payload: {
                  aps: {
                    sound: soundIos,
                    'content-available': 1,
                    ...(isChat ? {} : { 'interruption-level': 'time-sensitive' }),
                  },
                },
              },
              data: {
                ...data,
                title: message.title,
                body: message.body,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                android_channel_id: channelId,
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
