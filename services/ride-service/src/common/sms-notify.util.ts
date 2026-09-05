import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

export async function sendPlatformSms(phone: string | undefined | null, text: string, purpose = 'notify') {
  const dest = phone?.trim();
  if (!dest || !text.trim()) return { sent: false as const };
  try {
    const res = await fetch(serviceUrl('auth', '/internal/sms'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY,
      },
      body: JSON.stringify({ phone: dest, text, purpose }),
    });
    return { sent: res.ok };
  } catch {
    return { sent: false as const };
  }
}

export function deliveryPinSms(pin: string, kind: 'colis' | 'repas' | 'express' | 'course' = 'colis') {
  return `SENGA: votre code de réception (${kind}) est ${pin}. Donnez-le uniquement au livreur à la livraison. Ne le communiquez à personne d'autre.`;
}
