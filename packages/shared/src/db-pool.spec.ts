import { DB_POOL_DEFAULTS, prismaPoolOptions, withPoolSettings } from './db-pool';

describe('withPoolSettings', () => {
  it('adds the pool size and wait to a plain URL', () => {
    expect(withPoolSettings('postgresql://u:p@h:5432/db', 20, 20)).toBe(
      'postgresql://u:p@h:5432/db?connection_limit=20&pool_timeout=20',
    );
  });
  it('keeps existing parameters and values already set', () => {
    expect(withPoolSettings('postgresql://u:p@h/db?sslmode=require', 6, 20)).toBe(
      'postgresql://u:p@h/db?sslmode=require&connection_limit=6&pool_timeout=20',
    );
    expect(withPoolSettings('postgresql://h/db?connection_limit=5&pool_timeout=30', 20, 20)).toBe(
      'postgresql://h/db?connection_limit=5&pool_timeout=30',
    );
  });
  it('leaves a missing URL alone', () => {
    expect(withPoolSettings(undefined, 20, 20)).toBeUndefined();
    expect(withPoolSettings('', 20, 20)).toBe('');
  });
});

describe('prismaPoolOptions', () => {
  const url = 'postgresql://u:p@h/db';
  it('uses the service default', () => {
    expect(prismaPoolOptions(DB_POOL_DEFAULTS.auth, { DATABASE_URL: url })).toEqual({
      datasourceUrl: `${url}?connection_limit=6&pool_timeout=20`,
    });
  });
  it('lets DB_CONNECTION_LIMIT override it, within bounds', () => {
    expect(prismaPoolOptions(6, { DATABASE_URL: url, DB_CONNECTION_LIMIT: '10' })?.datasourceUrl).toContain('connection_limit=10');
    expect(prismaPoolOptions(6, { DATABASE_URL: url, DB_CONNECTION_LIMIT: '500' })?.datasourceUrl).toContain('connection_limit=60');
  });
  it('returns undefined without DATABASE_URL (Prisma then reads the schema env)', () => {
    expect(prismaPoolOptions(6, {})).toBeUndefined();
  });
  it('keeps the shared database under its ~100 connections even during a deploy', () => {
    const total = Object.values(DB_POOL_DEFAULTS).reduce((a, b) => a + b, 0);
    expect(total * 2).toBeLessThan(90);
  });
});
