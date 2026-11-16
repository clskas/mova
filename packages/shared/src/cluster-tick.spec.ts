import { claimClusterTick, clusterTickEnv, clusterTickLockMs, runClusterTick } from './cluster-tick';

/** In-memory Redis SET NX PX, shared by two "instances". */
function fakeRedis() {
  const keys = new Map<string, number>();
  return {
    client: {
      set: jest.fn(async (key: string, _v: string, _px: string, ms: number, _nx: string) => {
        const until = keys.get(key);
        if (until && until > Date.now()) return null;
        keys.set(key, Date.now() + Number(ms));
        return 'OK';
      }),
    },
  };
}

describe('cluster tick locks', () => {
  afterEach(() => delete process.env.CLUSTER_TICK_LOCKS);

  it('runs a job once per period across two instances', async () => {
    const redis = fakeRedis();
    const job = jest.fn();
    await runClusterTick(redis, 'reminders', 60_000, job); // instance A
    await runClusterTick(redis, 'reminders', 60_000, job); // instance B, same period
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('keeps different jobs independent', async () => {
    const redis = fakeRedis();
    expect(await claimClusterTick(redis, 'a', 60_000)).toBe(true);
    expect(await claimClusterTick(redis, 'b', 60_000)).toBe(true);
  });

  it('runs without Redis, when Redis fails, or when the locks are off (single instance)', async () => {
    expect(await claimClusterTick(undefined, 'x', 5000)).toBe(true);
    expect(await claimClusterTick({ client: { set: async (): Promise<unknown> => { throw new Error('down'); } } }, 'x', 5000)).toBe(true);
    process.env.CLUSTER_TICK_LOCKS = 'false';
    const redis = fakeRedis();
    await claimClusterTick(redis, 'x', 5000);
    expect(await claimClusterTick(redis, 'x', 5000)).toBe(true);
  });

  it('never lets a job error escape', async () => {
    await expect(runClusterTick(undefined, 'x', 5000, () => { throw new Error('boom'); })).resolves.toBeUndefined();
  });

  it('locks for 90 % of the period, at least 1 s', () => {
    expect(clusterTickLockMs(5000)).toBe(4500);
    expect(clusterTickLockMs(500)).toBe(1000);
  });

  it('keeps staging and production locks apart on a shared Redis', async () => {
    const redis = fakeRedis();
    const prev = process.env.APP_ENV;
    process.env.APP_ENV = 'staging';
    expect(await claimClusterTick(redis, 'ride-search', 5000)).toBe(true);
    process.env.APP_ENV = 'production';
    expect(await claimClusterTick(redis, 'ride-search', 5000)).toBe(true);
    if (prev === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = prev;
    expect(clusterTickEnv({ APP_ENV: 'Production' })).toBe('production');
  });
});
