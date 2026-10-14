import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth, JWT } from 'google-auth-library';

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

type ServiceAccount = {
  type?: string;
  project_id?: string;
  private_key?: string;
  client_email?: string;
  [key: string]: unknown;
};

@Injectable()
export class FcmPushService {
  private readonly logger = new Logger(FcmPushService.name);
  private cachedAuth: GoogleAuth | null = null;
  private cachedProjectId: string | null = null;
  private configLogged = false;

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.loadServiceAccount() || this.config.get<string>('FCM_SERVER_KEY')?.trim());
  }

  async sendToTokens(
    tokens: string[],
    message: FcmPushMessage,
    opts?: { profile?: FcmPushProfile },
  ): Promise<void> {
    if (tokens.length === 0) return;

    const unique = [...new Set(tokens.filter(Boolean))];
    const data = Object.fromEntries(
      Object.entries(message.data ?? {}).map(([k, v]) => [k, String(v)]),
    );
    const profile = opts?.profile ?? 'job';
    const isChat = profile === 'chat';
    const channelId = isChat ? SENGA_CHAT_CHANNEL : SENGA_DRIVER_JOB_CHANNEL;
    const soundAndroid = isChat ? 'default' : SENGA_DRIVER_JOB_SOUND_ANDROID;
    const soundIos = isChat ? 'default' : SENGA_DRIVER_JOB_SOUND_IOS;

    const sa = this.loadServiceAccount();
    if (sa) {
      await this.sendViaHttpV1(unique, message, data, {
        isChat,
        channelId,
        soundAndroid,
        soundIos,
      });
      return;
    }

    const serverKey = this.config.get<string>('FCM_SERVER_KEY')?.trim();
    if (!serverKey) return;

    if (!this.configLogged) {
      this.configLogged = true;
      this.logger.warn(
        'FCM_SERVER_KEY (legacy) is set but new Firebase projects cannot use the legacy send API. Prefer FCM_SERVICE_ACCOUNT_JSON.',
      );
    }

    await this.sendViaLegacy(unique, message, data, serverKey, {
      isChat,
      channelId,
      soundAndroid,
      soundIos,
    });
  }

  private loadServiceAccount(): ServiceAccount | null {
    const raw =
      this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON')?.trim() ||
      this.decodeBase64(this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON_BASE64')?.trim());
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ServiceAccount;
      if (!parsed.client_email || !parsed.private_key) {
        this.logger.warn('FCM service account JSON missing client_email/private_key');
        return null;
      }
      return parsed;
    } catch (e) {
      this.logger.warn('Invalid FCM_SERVICE_ACCOUNT_JSON', e);
      return null;
    }
  }

  private decodeBase64(value?: string | null): string | null {
    if (!value) return null;
    try {
      return Buffer.from(value, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  private getAuth(sa: ServiceAccount): { auth: GoogleAuth; projectId: string } {
    if (this.cachedAuth && this.cachedProjectId) {
      return { auth: this.cachedAuth, projectId: this.cachedProjectId };
    }
    const projectId =
      this.config.get<string>('FCM_PROJECT_ID')?.trim() ||
      sa.project_id ||
      'senga-6ffda';
    this.cachedAuth = new GoogleAuth({
      credentials: sa,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      projectId,
    });
    this.cachedProjectId = projectId;
    if (!this.configLogged) {
      this.configLogged = true;
      this.logger.log(`FCM HTTP v1 ready project=${projectId}`);
    }
    return { auth: this.cachedAuth, projectId };
  }

  private async sendViaHttpV1(
    tokens: string[],
    message: FcmPushMessage,
    data: Record<string, string>,
    opts: {
      isChat: boolean;
      channelId: string;
      soundAndroid: string;
      soundIos: string;
    },
  ): Promise<void> {
    const sa = this.loadServiceAccount();
    if (!sa) return;
    const { auth, projectId } = this.getAuth(sa);
    const client = (await auth.getClient()) as JWT;
    const accessToken = (await client.getAccessToken()).token;
    if (!accessToken) {
      this.logger.warn('FCM v1: failed to obtain access token');
      return;
    }

    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    await Promise.all(
      tokens.map(async (token) => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: opts.isChat
                ? {
                    token,
                    notification: {
                      title: message.title,
                      body: message.body,
                    },
                    data: {
                      ...data,
                      title: message.title,
                      body: message.body,
                      click_action: 'FLUTTER_NOTIFICATION_CLICK',
                      android_channel_id: opts.channelId,
                    },
                    android: {
                      priority: 'high',
                      notification: {
                        channel_id: opts.channelId,
                        sound: opts.soundAndroid,
                      },
                    },
                    apns: {
                      headers: { 'apns-priority': '10' },
                      payload: {
                        aps: {
                          alert: { title: message.title, body: message.body },
                          sound: opts.soundIos,
                          'content-available': 1,
                        },
                      },
                    },
                  }
                : {
                    // Jobs : notification Android + data. App tuée → le tray FCM
                    // sonne même sans isolate Dart (data-only ne réveillait pas
                    // assez d’OEM). Handler local ajoute fullScreenIntent si vivant.
                    token,
                    notification: {
                      title: message.title,
                      body: message.body,
                    },
                    data: {
                      ...data,
                      title: message.title,
                      body: message.body,
                      click_action: 'FLUTTER_NOTIFICATION_CLICK',
                      android_channel_id: opts.channelId,
                    },
                    android: {
                      priority: 'high',
                      direct_boot_ok: true,
                      notification: {
                        channel_id: opts.channelId,
                        sound: opts.soundAndroid,
                        default_vibrate_timings: true,
                        notification_priority: 'PRIORITY_MAX',
                        visibility: 'PUBLIC',
                      },
                    },
                    apns: {
                      headers: {
                        'apns-priority': '10',
                        'apns-push-type': 'alert',
                      },
                      payload: {
                        aps: {
                          alert: { title: message.title, body: message.body },
                          sound: opts.soundIos,
                          'content-available': 1,
                          'interruption-level': 'time-sensitive',
                        },
                      },
                    },
                  },
            }),
          });
          if (!res.ok) {
            const text = await res.text();
            this.logger.warn(`FCM v1 push failed (${res.status}) token=${token.slice(0, 12)}… ${text}`);
          }
        } catch (e) {
          this.logger.warn(`FCM v1 push error token=${token.slice(0, 12)}…`, e);
        }
      }),
    );
  }

  private async sendViaLegacy(
    tokens: string[],
    message: FcmPushMessage,
    data: Record<string, string>,
    serverKey: string,
    opts: {
      isChat: boolean;
      channelId: string;
      soundAndroid: string;
      soundIos: string;
    },
  ): Promise<void> {
    await Promise.all(
      tokens.map(async (token) => {
        try {
          const res = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              Authorization: `key=${serverKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(
              opts.isChat
                ? {
                    to: token,
                    priority: 'high',
                    content_available: true,
                    notification: {
                      title: message.title,
                      body: message.body,
                      sound: opts.soundIos,
                      android_channel_id: opts.channelId,
                    },
                    data: {
                      ...data,
                      title: message.title,
                      body: message.body,
                      click_action: 'FLUTTER_NOTIFICATION_CLICK',
                      android_channel_id: opts.channelId,
                    },
                  }
                : {
                    to: token,
                    priority: 'high',
                    content_available: true,
                    // Jobs : tray FCM sonne app tuée ; data pour deep-link / FSI.
                    data: {
                      ...data,
                      title: message.title,
                      body: message.body,
                      click_action: 'FLUTTER_NOTIFICATION_CLICK',
                      android_channel_id: opts.channelId,
                    },
                    notification: {
                      title: message.title,
                      body: message.body,
                      sound: opts.soundIos,
                      android_channel_id: opts.channelId,
                    },
                  },
            ),
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
