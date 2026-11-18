import { Logger } from '@nestjs/common';

/**
 * How often each ride-service instance re-reads the settings saved from the admin
 * (client apps, platform rules and prices, active cities).
 *
 * Those settings live in memory, loaded at startup and updated only on the instance that
 * received the admin change. With two instances, the other one kept the old values: on
 * 2026-11-18 a SENGA Driver withdrawal passed the ceiling check on one instance (new
 * ceiling) and was refused on the other (still 0).
 */
export const SETTINGS_REFRESH_MS = 20_000;

/** Re-runs [reload] every SETTINGS_REFRESH_MS; errors are logged, never thrown. */
export function startSettingsRefresh(
  reload: () => Promise<unknown>,
  logger: Logger,
  label: string,
): ReturnType<typeof setInterval> {
  const timer = setInterval(() => {
    void reload().catch((err: unknown) => {
      logger.warn(`${label} refresh skipped: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, SETTINGS_REFRESH_MS);
  timer.unref?.();
  return timer;
}
