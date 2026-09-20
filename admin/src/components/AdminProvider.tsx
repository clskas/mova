"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchCurrentUser, type AdminSessionUser } from "@/lib/api";
import { getToken, roleFromToken, managedCityFromToken } from "@/lib/auth";
import {
  canAccessSection,
  canWriteSection,
  defaultPathForRole,
  normalizeAdminRole,
  sectionFromPath,
  type AdminRole,
  type AdminSection,
} from "@/lib/rbac";

function resolveStaffRole(meRole?: string | null, token?: string | null): AdminRole | null {
  const fromMe = normalizeAdminRole(meRole);
  const fromJwt = normalizeAdminRole(roleFromToken(token));
  return fromMe ?? fromJwt;
}

type AdminContextValue = {
  user: AdminSessionUser | null;
  role: AdminRole | null;
  accessLevelIds: string[] | null;
  loading: boolean;
  canAccess: (section: AdminSection) => boolean;
  canWrite: (section: AdminSection) => boolean;
  refresh: () => Promise<void>;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminSessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    const jwtRole = normalizeAdminRole(roleFromToken(token));
    const jwtCity = managedCityFromToken(token);
    try {
      const me = await fetchCurrentUser();
      const role = resolveStaffRole(me.role, token);
      if (!role) {
        setUser(null);
        return;
      }
      setUser({
        ...me,
        role,
        managedCity: me.managedCity ?? jwtCity,
      });
    } catch {
      if (jwtRole) {
        setUser({
          id: "jwt",
          role: jwtRole,
          firstName: "Admin",
          lastName: jwtRole,
          managedCity: jwtCity,
        });
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const role = user?.role ? normalizeAdminRole(user.role) : null;
  const accessLevelIds =
    user?.permissionsCustomized && user.accessLevelIds?.length ? user.accessLevelIds : null;

  useEffect(() => {
    if (loading || !role || pathname.startsWith("/login")) return;
    const section = sectionFromPath(pathname);
    if (section && !canAccessSection(role, section, accessLevelIds)) {
      router.replace(defaultPathForRole(role, accessLevelIds));
    }
  }, [loading, role, accessLevelIds, pathname, router]);

  const value = useMemo<AdminContextValue>(() => {
    const canAccess = (section: AdminSection) =>
      role ? canAccessSection(role, section, accessLevelIds) : false;
    const canWrite = (section: AdminSection) =>
      role ? canWriteSection(role, section, accessLevelIds) : false;
    return { user, role, accessLevelIds, loading, canAccess, canWrite, refresh };
  }, [user, role, accessLevelIds, loading, refresh]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}
