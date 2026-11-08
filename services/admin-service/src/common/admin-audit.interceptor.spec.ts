import { auditSafeBody } from './admin-audit.interceptor';

describe('auditSafeBody', () => {
  it('hides codes and secrets, keeps the useful fields', () => {
    expect(
      auditSafeBody({ amountCdf: 5000, type: 'CREDIT', description: 'Geste', loginPin: '123456', apiKey: 'k', phone: '+243' }),
    ).toEqual({ amountCdf: 5000, type: 'CREDIT', description: 'Geste', loginPin: '***', apiKey: '***', phone: '+243' });
  });

  it('shortens long texts and big lists', () => {
    const out = auditSafeBody({ text: 'x'.repeat(500), list: Array.from({ length: 50 }, (_, i) => i) }) as {
      text: string;
      list: number[];
    };
    expect(out.text.length).toBeLessThanOrEqual(301);
    expect(out.list).toHaveLength(20);
  });
});
