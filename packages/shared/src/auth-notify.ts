import { serviceUrl } from './service-urls';
import { resolveInternalApiKey } from './prod-security';

export type AuthUserNotifyResult = {
  smsSent: boolean;
  emailSent: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  smsError?: string;
  emailError?: string;
  /** Masked destination for admin alerts (ex. af***@gmail.com). Never the PIN. */
  emailMasked?: string;
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

/** French message when driver→auth HTTP fails (undici "fetch failed", timeout, bad URL). */
export function authNotifyUnreachableError(raw?: string): string {
  const detail = (raw ?? '').trim();
  if (!detail || /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|aborted/i.test(detail)) {
    return "E-mail non envoyé : service d'authentification injoignable. Réessayez « Renvoyer le PIN ».";
  }
  return `E-mail non envoyé : ${detail}`;
}

/** SMS (AfriSoft hub, +243) and/or e-mail via auth User.phone / User.email. Never log PIN. */
export async function notifyAuthUser(
  userId: string,
  payload: AuthUserNotifyPayload,
): Promise<AuthUserNotifyResult> {
  try {
    const res = await fetch(serviceUrl('auth', `/internal/users/${userId}/notify`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': resolveInternalApiKey(),
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as AuthUserNotifyResult & { message?: string };
    if (!res.ok) {
      return {
        ...EMPTY_NOTIFY,
        emailError: json.message || `Auth notify HTTP ${res.status}`,
        emailMasked: typeof json.emailMasked === 'string' ? json.emailMasked : undefined,
      };
    }
    return {
      smsSent: json.smsSent === true,
      emailSent: json.emailSent === true,
      hasPhone: json.hasPhone === true,
      hasEmail: json.hasEmail === true,
      smsError: json.smsError,
      emailError: json.emailError,
      emailMasked: typeof json.emailMasked === 'string' ? json.emailMasked : undefined,
    };
  } catch (e) {
    return {
      ...EMPTY_NOTIFY,
      emailError: authNotifyUnreachableError((e as Error).message),
    };
  }
}
