import {
  INTERNAL_API_KEY,
  resolveSosAlertUserIds,
  rolesForSosAudiences,
  serviceUrl,
  type SosAlertAudience,
} from '@mova/shared';

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
  /** When true, recipient is from a role audience — no SMS (ops only). */
  audienceOnly?: boolean;
};

type SosClientAppsSlice = {
  sosAlertUserIds?: string[];
  sosAlertAudiences?: SosAlertAudience[];
};

async function fetchClientAppsSosConfig(): Promise<SosClientAppsSlice> {
  try {
    const res = await fetch(serviceUrl('ride', '/internal/client-apps-config'), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as SosClientAppsSlice;
    return {
      sosAlertUserIds: Array.isArray(data.sosAlertUserIds) ? data.sosAlertUserIds : [],
      sosAlertAudiences: Array.isArray(data.sosAlertAudiences) ? data.sosAlertAudiences : [],
    };
  } catch {
    return {};
  }
}

async function fetchUsersByRoles(roles: string[]): Promise<OpsStaffBrief[]> {
  if (roles.length === 0) return [];
  try {
    const qs = new URLSearchParams({ roles: roles.join(','), take: '500' });
    const res = await fetch(serviceUrl('auth', `/internal/users/by-roles?${qs}`), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as OpsStaffBrief[];
    return (Array.isArray(data) ? data : []).map((u) => ({ ...u, audienceOnly: true }));
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
    const cfg = await fetchClientAppsSosConfig();
    const allowedIds = new Set(
      resolveSosAlertUserIds(
        {
          sosAlertUserIds: cfg.sosAlertUserIds ?? [],
          sosAlertAudiences: cfg.sosAlertAudiences ?? [],
        } as Parameters<typeof resolveSosAlertUserIds>[0],
        all.map((s) => s.id),
      ),
    );
    const ops = all.filter((s) => allowedIds.has(s.id));

    const audienceRoles = rolesForSosAudiences(cfg.sosAlertAudiences ?? []);
    const audienceUsers = await fetchUsersByRoles(audienceRoles);
    const seen = new Set(ops.map((s) => s.id));
    const extra = audienceUsers.filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
    return [...ops, ...extra];
  } catch {
    return [];
  }
}
