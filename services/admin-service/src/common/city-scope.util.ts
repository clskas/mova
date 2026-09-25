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

/** Parse `city=Kinshasa,Beni` or repeated values into a unique trimmed list. */
export function parseCityFilterQuery(city?: string | string[] | null): string[] {
  if (city == null) return [];
  const raw = Array.isArray(city) ? city.join(',') : city;
  return [...new Set(raw.split(',').map((c) => c.trim()).filter(Boolean))];
}

/**
 * Effective city filter for list endpoints.
 * CITY_ADMIN → always JWT city (client cannot widen).
 * SUPER_ADMIN / ADMIN → optional query cities (empty = nationwide).
 */
export function resolveCityFilterList(
  user?: AdminJwtUser | null,
  cityQuery?: string | string[] | null,
): string[] {
  const scoped = resolveManagedCityScope(user);
  if (scoped) return [scoped];
  return parseCityFilterQuery(cityQuery);
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

/** Match driver/partner `operatingCity` / `city` string against managedCity (case-insensitive). */
export function filterRowsByCityName<T>(
  rows: T[],
  managedCity: string | null,
  getCity: (row: T) => string | null | undefined,
): T[] {
  if (!managedCity) return rows;
  const key = managedCity.toLowerCase();
  return rows.filter((row) => (getCity(row)?.trim().toLowerCase() ?? '') === key);
}

export function assertCityMatch(
  managedCity: string | null,
  actualCity: string | null | undefined,
  message = 'Ressource hors de votre ville gérée.',
): void {
  if (!managedCity) return;
  if ((actualCity?.trim().toLowerCase() ?? '') !== managedCity.toLowerCase()) {
    throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN, message);
  }
}

export function forceCityOnBody(
  managedCity: string | null,
  body: Record<string, unknown>,
  field = 'city',
): Record<string, unknown> {
  if (!managedCity) return body;
  const existing = typeof body[field] === 'string' ? String(body[field]).trim() : '';
  if (existing && existing.toLowerCase() !== managedCity.toLowerCase()) {
    throw new MovaHttpException(
      MovaErrorCode.AUTH_FORBIDDEN,
      HttpStatus.FORBIDDEN,
      `Vous ne pouvez modifier que les tarifs de ${managedCity}.`,
    );
  }
  return { ...body, [field]: managedCity };
}

/** Forbid CITY_ADMIN access when GPS resolves outside managedCity (or GPS missing). */
export function assertCoordsInManagedCity(
  managedCity: string | null,
  lat?: number | null,
  lng?: number | null,
  message = 'Ressource hors de votre ville gérée.',
): void {
  if (!managedCity) return;
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN, message);
  }
  const resolved = resolveCityFromCoords(Number(lat), Number(lng));
  if (resolved.trim().toLowerCase() !== managedCity.trim().toLowerCase()) {
    throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN, message);
  }
}
