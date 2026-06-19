import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

export type UserBrief = { name?: string; phone?: string };

export async function fetchAuthUserBrief(userId: string): Promise<UserBrief | null> {
  try {
    const res = await fetch(serviceUrl('auth', `/internal/users/${userId}`), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { firstName?: string; lastName?: string; phone?: string };
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return { name: name || undefined, phone: user.phone };
  } catch {
    return null;
  }
}
