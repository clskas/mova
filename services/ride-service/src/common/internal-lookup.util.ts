import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';

export type UserBrief = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  role?: string;
  pinConfigured?: boolean;
};

export async function fetchAuthUserBrief(userId: string): Promise<UserBrief | null> {
  try {
    const res = await fetch(serviceUrl('auth', `/internal/users/${userId}`), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string | null;
      role?: string;
      pinConfigured?: boolean;
    };
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return {
      id: userId,
      name: name || undefined,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      email: user.email?.trim() || undefined,
      role: user.role,
      pinConfigured: user.pinConfigured === true,
    };
  } catch {
    return null;
  }
}

/** Self-declared gender of drivers / passengers ('F' | 'M' | null). Never throws. */
export async function fetchUserGenders(ids: string[]): Promise<Record<string, string | null>> {
  if (!ids.length) return {};
  try {
    const res = await fetch(serviceUrl('auth', '/internal/users/genders'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok ? ((await res.json()) as Record<string, string | null>) : {};
  } catch {
    return {};
  }
}
