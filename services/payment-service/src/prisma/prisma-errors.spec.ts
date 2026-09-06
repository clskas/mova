import { isPrismaUniqueViolation } from './prisma-errors';

describe('isPrismaUniqueViolation', () => {
  it('accepte P2002', () => {
    expect(isPrismaUniqueViolation({ code: 'P2002' })).toBe(true);
  });

  it('rejette les autres erreurs', () => {
    expect(isPrismaUniqueViolation({ code: 'P2003' })).toBe(false);
    expect(isPrismaUniqueViolation(new Error('nope'))).toBe(false);
    expect(isPrismaUniqueViolation(null)).toBe(false);
  });
});
