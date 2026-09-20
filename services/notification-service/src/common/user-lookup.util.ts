import { INTERNAL_API_KEY, resolveSosAlertUserIds, serviceUrl } from '@mova/shared';

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

export type OpsStaffBrief = {
  id: string;
  phone?: string | null;
  role: string;
  managedCity?: string | null;
  name?: string;
};

async function fetchClientAppsSosConfig(): Promise<string[]> {
  try {
    const res = await fetch(serviceUrl('ride', '/internal/client-apps-config'), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { sosAlertUserIds?: string[] };
    return Array.isArray(data.sosAlertUserIds) ? data.sosAlertUserIds : [];
  } catch {
    return [];
  }
}

export async function fetchOpsStaffForAlerts(): Promise<OpsStaffBrief[]> {
  try {
    const res = await fetch(serviceUrl('auth', '/internal/users/ops-staff'), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as OpsStaffBrief[];
    const all = Array.isArray(data) ? data : [];
    const selectedIds = await fetchClientAppsSosConfig();
    const allowedIds = new Set(
      resolveSosAlertUserIds(
        { sosAlertUserIds: selectedIds } as Parameters<typeof resolveSosAlertUserIds>[0],
        all.map((s) => s.id),
      ),
    );
    return all.filter((s) => allowedIds.has(s.id));
  } catch {
    return [];
  }
}
