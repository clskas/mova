import { Prisma } from '@prisma/client';
import { isTransientDbError } from './prisma.service';

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
