import { authNotifyUnreachableError, notifyAuthUser } from './auth-notify';

describe('authNotifyUnreachableError', () => {
  it('traduit fetch failed en français actionnable', () => {
    expect(authNotifyUnreachableError('fetch failed')).toMatch(/injoignable/);
    expect(authNotifyUnreachableError('fetch failed')).toMatch(/Renvoyer le PIN/);
  });

  it('conserve le détail SMTP / HTTP', () => {
    expect(authNotifyUnreachableError('Authentification SMTP refusée.')).toContain('SMTP');
  });
});

describe('notifyAuthUser', () => {
  beforeEach(() => {
    process.env.INTERNAL_API_KEY = 'test-internal-key-24chars-min';
    process.env.AUTH_SERVICE_URL = 'https://mova-auth.onrender.com';
  });

  it('propage emailMasked et n\'utilise pas fetch failed brut', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        smsSent: false,
        emailSent: true,
        hasPhone: false,
        hasEmail: true,
        emailMasked: 'af***@gmail.com',
      }),
    })) as jest.Mock;

    const result = await notifyAuthUser('u1', {
      smsText: 'x',
      emailSubject: 's',
      emailText: 't',
    });
    expect(result.emailSent).toBe(true);
    expect(result.emailMasked).toBe('af***@gmail.com');
  });

  it('renvoie une erreur française si fetch échoue', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('fetch failed');
    }) as jest.Mock;

    const result = await notifyAuthUser('u1', {
      smsText: 'x',
      emailSubject: 's',
      emailText: 't',
    });
    expect(result.emailSent).toBe(false);
    expect(result.emailError).toMatch(/injoignable/);
    expect(result.emailError).not.toBe('fetch failed');
  });
});
