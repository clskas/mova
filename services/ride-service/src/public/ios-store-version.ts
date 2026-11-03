import { Injectable, Logger } from '@nestjs/common';

/**
 * Live App Store versions, read from Apple's public iTunes Lookup API.
 *
 * mobile-store-version.json is bumped right after an upload, but iOS builds then
 * wait for App Review (days). Advertising that version to iPhones showed an update
 * banner the App Store could not satisfy. iOS clients get what is actually live.
 */
export type IosLiveVersions = { passenger: string | null; driver: string | null };

const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

/** `version` of the first lookup result, or null when the app is not live in that store. */
export function parseItunesLookupVersion(json: unknown): string | null {
  const results = (json as { results?: Array<{ version?: unknown }> } | null)?.results;
  const version = Array.isArray(results) ? results[0]?.version : undefined;
  return typeof version === 'string' && /^\d+(\.\d+)*$/.test(version.trim()) ? version.trim() : null;
}

@Injectable()
export class IosStoreVersionService {
  private readonly logger = new Logger(IosStoreVersionService.name);
  private cached: { value: IosLiveVersions; at: number } | null = null;
  private inflight: Promise<IosLiveVersions> | null = null;

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async get(now: number = Date.now()): Promise<IosLiveVersions> {
    if (this.cached && now - this.cached.at < CACHE_TTL_MS) return this.cached.value;
    if (!this.inflight) {
      this.inflight = this.refresh(now).finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async refresh(now: number): Promise<IosLiveVersions> {
    const [passenger, driver] = await Promise.all([
      this.lookup(this.env.APP_STORE_PASSENGER_ID?.trim() || '6818768971'),
      this.lookup(this.env.APP_STORE_DRIVER_ID?.trim() || '6818769267'),
    ]);
    // Keep the last good value per app when Apple is unreachable.
    const value: IosLiveVersions = {
      passenger: passenger === undefined ? this.cached?.value.passenger ?? null : passenger,
      driver: driver === undefined ? this.cached?.value.driver ?? null : driver,
    };
    this.cached = { value, at: now };
    return value;
  }

  /** null = not live in this store; undefined = lookup failed. */
  private async lookup(appId: string): Promise<string | null | undefined> {
    const country = this.env.APP_STORE_COUNTRY?.trim() || 'cd';
    const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}&country=${encodeURIComponent(country)}`;
    try {
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseItunesLookupVersion(await res.json());
    } catch (e) {
      this.logger.warn(`iTunes lookup failed for ${appId}: ${(e as Error).message}`);
      return undefined;
    }
  }
}
