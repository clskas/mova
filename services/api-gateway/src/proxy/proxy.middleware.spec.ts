import { readFileSync } from 'fs';
import { join } from 'path';

describe('gateway proxy routes', () => {
  const src = readFileSync(join(__dirname, 'proxy.middleware.ts'), 'utf8');

  it('does not proxy /internal', () => {
    expect(src).not.toMatch(/['"]\/internal['"]/);
    expect(src).not.toMatch(/['"]\/api\/internal/);
  });
});

describe('gateway English translation', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { wantsTranslation, translateJsonBuffer } = require('./proxy.middleware');
  const req = (url: string, lang?: string) => ({ url, originalUrl: url, headers: lang ? { 'x-app-language': lang } : {} });

  it('translates only mobile English requests, never portals or files', () => {
    expect(wantsTranslation(req('/api/rides/1', 'en'))).toBe(true);
    expect(wantsTranslation(req('/api/rides/1', 'fr'))).toBe(false);
    expect(wantsTranslation(req('/api/rides/1'))).toBe(false);
    expect(wantsTranslation(req('/api/admin/users', 'en'))).toBe(false);
    expect(wantsTranslation(req('/api/restaurant/menu', 'en'))).toBe(false);
    expect(wantsTranslation(req('/api/billing/receipts/1/pdf', 'en'))).toBe(false);
  });

  it('translates French texts in JSON bodies and leaves other bodies alone', () => {
    const out = translateJsonBuffer(Buffer.from(JSON.stringify({ message: 'Course introuvable.' })), 'application/json; charset=utf-8');
    expect(JSON.parse(String(out))).toEqual({ message: 'Ride not found.' });
    const bin = Buffer.from([1, 2, 3]);
    expect(translateJsonBuffer(bin, 'application/pdf')).toBe(bin);
    const broken = Buffer.from('{not json');
    expect(translateJsonBuffer(broken, 'application/json')).toBe(broken);
  });
});
