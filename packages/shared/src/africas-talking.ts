/** Africa's Talking — URLs et helpers partagés (OTP SMS + Mobile Money RDC). */

export type AfricasTalkingEnv = 'sandbox' | 'production';

export const AFRICAS_TALKING_ENV_KEYS = {
  username: 'AFRICAS_TALKING_USERNAME',
  apiKey: 'AFRICAS_TALKING_API_KEY',
  smsSender: 'AFRICAS_TALKING_SMS_SENDER',
  env: 'AFRICAS_TALKING_ENV',
  productName: 'AFRICAS_TALKING_PRODUCT_NAME',
  mmCallbackUrl: 'AFRICAS_TALKING_MM_CALLBACK_URL',
  smsProvider: 'SMS_PROVIDER',
  mobileMoneyGateway: 'MOBILE_MONEY_GATEWAY',
} as const;

export type EnvGetter = (key: string) => string | undefined;

export function africasTalkingEnv(get: EnvGetter): AfricasTalkingEnv {
  return get(AFRICAS_TALKING_ENV_KEYS.env) === 'production' ? 'production' : 'sandbox';
}

export function africasTalkingSmsBaseUrl(get: EnvGetter): string {
  return africasTalkingEnv(get) === 'production'
    ? 'https://api.africastalking.com'
    : 'https://api.sandbox.africastalking.com';
}

export function africasTalkingPaymentsBaseUrl(get: EnvGetter): string {
  return africasTalkingEnv(get) === 'production'
    ? 'https://payments.africastalking.com'
    : 'https://payments.sandbox.africastalking.com';
}

export function isAfricasTalkingConfigured(get: EnvGetter): boolean {
  return Boolean(get(AFRICAS_TALKING_ENV_KEYS.username)?.trim() && get(AFRICAS_TALKING_ENV_KEYS.apiKey)?.trim());
}

export function isTwilioSmsConfigured(get: EnvGetter): boolean {
  return Boolean(
    get('TWILIO_ACCOUNT_SID')?.trim() &&
      get('TWILIO_AUTH_TOKEN')?.trim() &&
      (get('TWILIO_VERIFY_SERVICE_SID')?.trim() || get('TWILIO_PHONE_NUMBER')?.trim()),
  );
}

export type SmsBackend = 'mock' | 'africastalking' | 'twilio';

/** Résout le canal SMS actif (MOVA RDC : Africa's Talking par défaut). */
export function resolveSmsBackend(get: EnvGetter, mockMode: boolean): SmsBackend {
  if (mockMode) return 'mock';
  const preferred = (get(AFRICAS_TALKING_ENV_KEYS.smsProvider) ?? 'africastalking').trim().toLowerCase();
  if (preferred === 'africastalking') {
    if (isAfricasTalkingConfigured(get)) return 'africastalking';
    if (isTwilioSmsConfigured(get)) return 'twilio';
    return 'mock';
  }
  if (preferred === 'twilio') {
    if (isTwilioSmsConfigured(get)) return 'twilio';
    if (isAfricasTalkingConfigured(get)) return 'africastalking';
    return 'mock';
  }
  return 'mock';
}

export function useAfricasTalkingMobileMoney(get: EnvGetter): boolean {
  const gateway = (get(AFRICAS_TALKING_ENV_KEYS.mobileMoneyGateway) ?? 'africastalking').trim().toLowerCase();
  return gateway === 'africastalking' && isAfricasTalkingConfigured(get);
}

export type AfricasTalkingSmsResult = { success: boolean; message?: string };

/** Envoi SMS via Africa's Talking Messaging API. */
export async function africasTalkingSendSms(
  get: EnvGetter,
  params: { to: string; message: string; from?: string },
): Promise<AfricasTalkingSmsResult> {
  const username = get(AFRICAS_TALKING_ENV_KEYS.username)?.trim();
  const apiKey = get(AFRICAS_TALKING_ENV_KEYS.apiKey)?.trim();
  if (!username || !apiKey) {
    return {
      success: false,
      message: `Africa's Talking non configuré. Définissez ${AFRICAS_TALKING_ENV_KEYS.username} et ${AFRICAS_TALKING_ENV_KEYS.apiKey}.`,
    };
  }

  const from = params.from?.trim() || get(AFRICAS_TALKING_ENV_KEYS.smsSender)?.trim();
  const body = new URLSearchParams({
    username,
    to: params.to,
    message: params.message,
  });
  if (from) body.set('from', from);

  try {
    const res = await fetch(`${africasTalkingSmsBaseUrl(get)}/version1/messaging`, {
      method: 'POST',
      headers: {
        apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const raw = (await res.json().catch(() => ({}))) as {
      SMSMessageData?: { Message?: string; Recipients?: Array<{ statusCode?: number; status?: string }> };
    };
    if (!res.ok) {
      return { success: false, message: raw.SMSMessageData?.Message ?? `Échec SMS Africa's Talking (${res.status})` };
    }
    const recipients = raw.SMSMessageData?.Recipients ?? [];
    const ok = recipients.length === 0 || recipients.every((r) => r.statusCode === 101 || r.status === 'Success');
    return ok
      ? { success: true, message: raw.SMSMessageData?.Message ?? 'SMS envoyé' }
      : { success: false, message: raw.SMSMessageData?.Message ?? 'Échec envoi SMS Africa\'s Talking' };
  } catch {
    return { success: false, message: 'Service SMS Africa\'s Talking temporairement indisponible.' };
  }
}

export type MobileMoneyOperator = 'ORANGE_MONEY' | 'MPESA' | 'AIRTEL_MONEY';

/** Mappe l'opérateur MOVA vers le code produit Africa's Talking (à affiner selon contrat AT RDC). */
export function africasTalkingMobileMoneyProviderCode(operator: MobileMoneyOperator): string {
  switch (operator) {
    case 'ORANGE_MONEY':
      return 'ORANGE';
    case 'MPESA':
      return 'MPESA';
    case 'AIRTEL_MONEY':
      return 'AIRTEL';
    default:
      return operator;
  }
}

export type AfricasTalkingMmInitResult = { success: boolean; transactionId: string; providerRef: string; message?: string };

/**
 * Initie un paiement Mobile Money via Africa's Talking (checkout / STK).
 * Branchement API complet : voir docs AT Mobile Money + AFRICAS_TALKING_MM_CALLBACK_URL.
 */
export async function africasTalkingInitiateMobileMoney(
  get: EnvGetter,
  params: { operator: MobileMoneyOperator; amountCdf: number; phone: string; reference: string },
): Promise<AfricasTalkingMmInitResult> {
  if (!isAfricasTalkingConfigured(get)) {
    return {
      success: false,
      transactionId: '',
      providerRef: '',
      message: `Africa's Talking non configuré (${AFRICAS_TALKING_ENV_KEYS.username}, ${AFRICAS_TALKING_ENV_KEYS.apiKey}).`,
    };
  }

  const productName = get(AFRICAS_TALKING_ENV_KEYS.productName)?.trim();
  if (!productName) {
    return {
      success: false,
      transactionId: '',
      providerRef: '',
      message: `Définissez ${AFRICAS_TALKING_ENV_KEYS.productName} (nom produit Mobile Money Africa's Talking).`,
    };
  }

  const username = get(AFRICAS_TALKING_ENV_KEYS.username)!.trim();
  const apiKey = get(AFRICAS_TALKING_ENV_KEYS.apiKey)!.trim();
  const provider = africasTalkingMobileMoneyProviderCode(params.operator);
  const callbackUrl = get(AFRICAS_TALKING_ENV_KEYS.mmCallbackUrl)?.trim();

  try {
    const payload = {
      username,
      productName,
      provider,
      phoneNumber: params.phone,
      currencyCode: 'CDF',
      amount: params.amountCdf,
      metadata: { reference: params.reference, operator: params.operator },
      ...(callbackUrl ? { notifyUrl: callbackUrl } : {}),
    };

    const res = await fetch(`${africasTalkingPaymentsBaseUrl(get)}/mobile/checkout/request`, {
      method: 'POST',
      headers: {
        apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      transactionId?: string;
      description?: string;
      errorMessage?: string;
    };

    if (!res.ok || data.status === 'Failed') {
      return {
        success: false,
        transactionId: '',
        providerRef: '',
        message: data.errorMessage ?? data.description ?? `Échec Mobile Money Africa's Talking (${res.status})`,
      };
    }

    const txId = data.transactionId ?? `at_mm_${params.reference}`;
    return {
      success: true,
      transactionId: txId,
      providerRef: `at_${txId}`,
      message: data.description ?? 'Demande de paiement Mobile Money envoyée',
    };
  } catch {
    return {
      success: false,
      transactionId: '',
      providerRef: '',
      message: 'Service Mobile Money Africa\'s Talking temporairement indisponible.',
    };
  }
}
