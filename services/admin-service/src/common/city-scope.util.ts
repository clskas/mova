import { HttpStatus } from '@nestjs/common';
import {
  MovaErrorCode,
  MovaHttpException,
  UserRole,
  resolveCityFromCoords,
} from '@mova/shared';

export type AdminJwtUser = {
  id?: string;
  role?: string;
  managedCity?: string | null;
  status?: string;
};

/**
 * CITY_ADMIN is scoped to JWT managedCity; SUPER_ADMIN / other staff are unscoped (null).
 * Throws if CITY_ADMIN has no managedCity claim.
 */
export function resolveManagedCityScope(user?: AdminJwtUser | null): string | null {
  if (!user?.role || user.role !== UserRole.CITY_ADMIN) return null;
  const city = user.managedCity?.trim();
  if (!city) {
    throw new MovaHttpException(
      MovaErrorCode.AUTH_FORBIDDEN,
      HttpStatus.FORBIDDEN,
      'CITY_ADMIN sans ville gérée (managedCity). Demandez à un SUPER_ADMIN de configurer le compte.',
    );
  }
  return city;
}

type Coords = { lat?: number | null; lng?: number | null };

/**
 * In-memory city filter for admin list endpoints.
 *
 * CITY_ADMIN lists often page at the ride-service (skip/take) before this filter runs,
 * so a page may contain fewer rows than `take` after scoping. Prefer forcing `city=`
 * query params when the downstream API supports it (pricing, communes).
 */
export function filterRowsByManagedCity<T>(
  rows: T[],
  managedCity: string | null,
  getCoords: (row: T) => Coords | null | undefined,
): T[] {
  if (!managedCity) return rows;
  const key = managedCity.toLowerCase();
  return rows.filter((row) => {
    const c = getCoords(row);
    if (c?.lat == null || c?.lng == null || !Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lng))) {
      return false;
    }
    return resolveCityFromCoords(Number(c.lat), Number(c.lng)).toLowerCase() === key;
  });
}
