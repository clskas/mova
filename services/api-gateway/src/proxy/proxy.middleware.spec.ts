import { readFileSync } from 'fs';
import { join } from 'path';

describe('gateway proxy routes', () => {
  const src = readFileSync(join(__dirname, 'proxy.middleware.ts'), 'utf8');

  it('does not proxy /internal', () => {
    expect(src).not.toMatch(/['"]\/internal['"]/);
    expect(src).not.toMatch(/['"]\/api\/internal/);
  });
});
