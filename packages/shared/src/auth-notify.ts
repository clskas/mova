import { INTERNAL_API_KEY, serviceUrl } from './service-urls';

export type AuthUserNotifyResult = {
  smsSent: boolean;
  emailSent: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  smsError?: string;
  emailError?: string;
};

export type AuthUserNotifyPayload = {
  smsText: string;
  emailSubject: string;
  emailText: string;
  emailHtml?: string;
  purpose?: string;
};

const EMPTY_NOTIFY: AuthUserNotifyResult = {
  smsSent: false,
  emailSent: false,
  hasPhone: false,
  hasEmail: false,
};

/** SMS (AfriSoft hub, +243) and/or e-mail via auth User.phone / User.email. Never log PIN. */
export async function notifyAuthUser(
  userId: string,
  payload: AuthUserNotifyPayload,
): Promise<AuthUserNotifyResult> {
  try {
    const res = await fetch(serviceUrl('auth', `/internal/users/${userId}/notify`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as AuthUserNotifyResult & { message?: string };
    if (!res.ok) return EMPTY_NOTIFY;
    return {
      smsSent: json.smsSent === true,
      emailSent: json.emailSent === true,
      hasPhone: json.hasPhone === true,
      hasEmail: json.hasEmail === true,
      smsError: json.smsError,
      emailError: json.emailError,
    };
  } catch {
    return EMPTY_NOTIFY;
  }
}
