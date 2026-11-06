/** Largest number of photos for a driver's vehicle or a rental vehicle. */
export const MAX_VEHICLE_PHOTOS = 5;

/**
 * Clean a list of photo URLs: strings only, trimmed, no blanks or duplicates,
 * at most `max`. The first photo is the main one (cover / imageUrl).
 */
export function normalizePhotoUrls(value: unknown, max = MAX_VEHICLE_PHOTOS): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Photos to store for a vehicle: an explicit list wins (its first photo becomes
 * imageUrl); otherwise a single imageUrl from an older client becomes a list of one.
 */
export function resolveVehiclePhotos(input: {
  photoUrls?: unknown;
  imageUrl?: string | null;
}): { photoUrls: string[]; imageUrl: string | null } {
  const list = normalizePhotoUrls(input.photoUrls);
  if (list.length > 0) return { photoUrls: list, imageUrl: list[0] };
  const single = typeof input.imageUrl === 'string' && input.imageUrl.trim() ? input.imageUrl.trim() : null;
  return { photoUrls: single ? [single] : [], imageUrl: single };
}

/** Photos to show: the stored list, or the legacy single imageUrl. */
export function vehiclePhotoList(row: { photoUrls?: unknown; imageUrl?: string | null }): string[] {
  const list = normalizePhotoUrls(row.photoUrls);
  if (list.length > 0) return list;
  return row.imageUrl ? [row.imageUrl] : [];
}
