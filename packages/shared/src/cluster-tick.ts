/**
 * Background jobs (relances, renouvellements, recherche de chauffeur…) run with setInterval in
 * every instance of a service. With two instances or more, each tick would run twice: double
 * reminders, double payments. runClusterTick lets only one instance run a given job per period,
 * through a short Redis lock (SET NX PX) that is not released, so the job runs at most once per
 * period across the whole cluster.
 *
 * Fail-open: without Redis (tests, local dev) or when Redis does not answer, the job runs as it
 * did before (one instance = the previous behaviour). CLUSTER_TICK_LOCKS=false turns the locks off.
 */
export type ClusterTickRedis = {
  client: { set(key: string, value: string, px: 'PX', ms: number, nx: 'NX'): Promise<unknown> };
};

export function clusterTickLockMs(periodMs: number): number {
  return Math.max(1000, Math.floor(periodMs * 0.9));
}

/** True when this instance should run the job for the current period. */
export async function claimClusterTick(
  redis: ClusterTickRedis | undefined | null,
  name: string,
  periodMs: number,
): Promise<boolean> {
  if (!redis?.client || process.env.CLUSTER_TICK_LOCKS === 'false') return true;
  try {
    // Redis slow or reconnecting: do not hold the job back, run it (fail-open).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'TIMEOUT'>((resolve) => {
      timer = setTimeout(() => resolve('TIMEOUT'), 1500);
      (timer as { unref?: () => void }).unref?.();
    });
    const res = await Promise.race([
      redis.client.set(`tick:${name}`, String(process.pid), 'PX', clusterTickLockMs(periodMs), 'NX'),
      timeout,
    ]);
    if (timer) clearTimeout(timer);
    return res === 'OK' || res === 'TIMEOUT';
  } catch {
    return true;
  }
}

/** Runs [job] if this instance wins the period; job errors are logged, never unhandled. */
export async function runClusterTick(
  redis: ClusterTickRedis | undefined | null,
  name: string,
  periodMs: number,
  job: () => unknown,
): Promise<void> {
  if (!(await claimClusterTick(redis, name, periodMs))) return;
  try {
    await job();
  } catch (e) {
    console.warn(`[tick:${name}] ${e instanceof Error ? e.message : String(e)}`);
  }
}
