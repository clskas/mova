import { normalizeServiceBaseUrl, serviceUrl } from './service-urls';

describe('serviceUrl Render fallback', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('uses AUTH_SERVICE_URL when set', () => {
    process.env.AUTH_SERVICE_URL = 'https://custom-auth.example';
    delete process.env.RENDER;
    delete process.env.RENDER_SERVICE_ID;
    expect(serviceUrl('auth', '/internal/users/u1/notify')).toBe(
      'https://custom-auth.example/internal/users/u1/notify',
    );
  });

  it('adds http:// to Render hostport values (hostname:port)', () => {
    process.env.AUTH_SERVICE_URL = 'mova-auth:10000';
    delete process.env.RENDER;
    expect(normalizeServiceBaseUrl('mova-auth:10000')).toBe('http://mova-auth:10000');
    expect(serviceUrl('auth', '/internal/users/u1/issue-login-pin')).toBe(
      'http://mova-auth:10000/internal/users/u1/issue-login-pin',
    );
  });

  it('falls back to mova-auth.onrender.com on Render when AUTH_SERVICE_URL is missing', () => {
    delete process.env.AUTH_SERVICE_URL;
    process.env.RENDER = 'true';
    expect(serviceUrl('auth', '/internal/users/u1/issue-login-pin')).toBe(
      'https://mova-auth.onrender.com/internal/users/u1/issue-login-pin',
    );
  });

  it('ignores localhost AUTH_SERVICE_URL on Render and uses the public host', () => {
    process.env.AUTH_SERVICE_URL = 'http://localhost:3001';
    process.env.RENDER = 'true';
    expect(serviceUrl('auth', '/internal/users/x')).toBe('https://mova-auth.onrender.com/internal/users/x');
  });

  it('uses localhost off Render when AUTH_SERVICE_URL is missing', () => {
    delete process.env.AUTH_SERVICE_URL;
    delete process.env.RENDER;
    delete process.env.RENDER_SERVICE_ID;
    delete process.env.RENDER_EXTERNAL_URL;
    delete process.env.DOCKER;
    delete process.env.KUBERNETES_SERVICE_HOST;
    expect(serviceUrl('auth')).toMatch(/localhost:3001/);
  });
});
