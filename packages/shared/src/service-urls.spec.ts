import { serviceUrl } from './service-urls';

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

  it('falls back to mova-auth.onrender.com on Render when AUTH_SERVICE_URL is missing', () => {
    delete process.env.AUTH_SERVICE_URL;
    process.env.RENDER = 'true';
    expect(serviceUrl('auth', '/internal/users/u1/issue-login-pin')).toBe(
      'https://mova-auth.onrender.com/internal/users/u1/issue-login-pin',
    );
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
