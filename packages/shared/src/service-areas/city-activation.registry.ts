import { DRC_SERVICE_AREAS } from './drc-service-areas';

/** Overrides runtime (DB admin) : slug/id → actif. Absent = config statique. */
let activationBySlug = new Map<string, boolean>();
let activationByName = new Map<string, boolean>();
let hasRuntimeOverrides = false;

export function setCityActivationOverrides(
  cities: Array<{ slug: string; name: string; isActive: boolean }>,
): void {
  activationBySlug = new Map(cities.map((c) => [c.slug.toLowerCase(), c.isActive]));
  activationByName = new Map(cities.map((c) => [c.name.trim().toLowerCase(), c.isActive]));
  hasRuntimeOverrides = cities.length > 0;
}

export function clearCityActivationOverrides(): void {
  activationBySlug = new Map();
  activationByName = new Map();
  hasRuntimeOverrides = false;
}

function staticActive(areaId: string, areaName: string): boolean {
  const area = DRC_SERVICE_AREAS.find((a) => a.id === areaId || a.name.toLowerCase() === areaName.toLowerCase());
  return area?.active ?? true;
}

export function isCityOperational(areaId: string, areaName?: string): boolean {
  const slugKey = areaId.toLowerCase();
  if (activationBySlug.has(slugKey)) return activationBySlug.get(slugKey)!;
  if (areaName) {
    const nameKey = areaName.trim().toLowerCase();
    if (activationByName.has(nameKey)) return activationByName.get(nameKey)!;
  }
  if (hasRuntimeOverrides) return false;
  return staticActive(areaId, areaName ?? areaId);
}

export function cityInactiveMessage(cityName: string): string {
  return `SENGA n'est pas disponible à ${cityName} pour le moment.`;
}
