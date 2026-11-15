import { Prisma } from '@prisma/client';
import { isTransientDbError, withPoolSettings } from './prisma.service';

describe('isTransientDbError', () => {
  it('detects P1017 / P1001 / P1002', () => {
    expect(
      isTransientDbError(
        new Prisma.PrismaClientKnownRequestError('closed', {
          code: 'P1017',
          clientVersion: '5.22.0',
        }),
      ),
    ).toBe(true);
    expect(
      isTransientDbError(
        new Prisma.PrismaClientKnownRequestError('unreachable', {
          code: 'P1001',
          clientVersion: '5.22.0',
        }),
      ),
    ).toBe(true);
  });

  it('detects Render FATAL message', () => {
    expect(
      isTransientDbError(new Error('Error querying the database: FATAL: service temporarily unavailable')),
    ).toBe(true);
  });

  it('ignores business errors', () => {
    expect(
      isTransientDbError(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      ),
    ).toBe(false);
    expect(isTransientDbError(new Error('Record to update not found'))).toBe(false);
  });
});

describe('withPoolSettings', () => {
  it('adds the pool size and wait to a plain URL', () => {
    expect(withPoolSettings('postgresql://u:p@h:5432/db', 20, 20)).toBe('postgresql://u:p@h:5432/db?connection_limit=20&pool_timeout=20');
  });
  it('keeps existing parameters and values already set', () => {
    expect(withPoolSettings('postgresql://u:p@h/db?sslmode=require', 20, 20)).toBe(
      'postgresql://u:p@h/db?sslmode=require&connection_limit=20&pool_timeout=20',
    );
    expect(withPoolSettings('postgresql://h/db?connection_limit=5&pool_timeout=30', 20, 20)).toBe('postgresql://h/db?connection_limit=5&pool_timeout=30');
  });
  it('leaves a missing URL alone', () => {
    expect(withPoolSettings(undefined, 20, 20)).toBeUndefined();
    expect(withPoolSettings('', 20, 20)).toBe('');
  });
});
