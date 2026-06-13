"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchCurrentUser, type AdminSessionUser } from "@/lib/api";
import { getToken, roleFromToken } from "@/lib/auth";
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
    try {
      const me = await fetchCurrentUser();
      const role = resolveStaffRole(me.role, token);
      if (!role) {
        setUser(null);
        return;
      }
      setUser({ ...me, role });
    } catch {
      if (jwtRole) {
        setUser({
          id: "jwt",
          role: jwtRole,
          firstName: "Admin",
          lastName: jwtRole,
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

  useEffect(() => {
    if (loading || !role || pathname.startsWith("/login")) return;
    const section = sectionFromPath(pathname);
    if (section && !canAccessSection(role, section)) {
      router.replace(defaultPathForRole(role));
    }
  }, [loading, role, pathname, router]);

  const value = useMemo<AdminContextValue>(() => {
    const canAccess = (section: AdminSection) => (role ? canAccessSection(role, section) : false);
    const canWrite = (section: AdminSection) => (role ? canWriteSection(role, section) : false);
    return { user, role, loading, canAccess, canWrite, refresh };
  }, [user, role, loading, refresh]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}
