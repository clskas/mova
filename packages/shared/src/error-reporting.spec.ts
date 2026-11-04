import { buildSentryEvent, parseSentryDsn, reportError, setErrorReportingService } from './error-reporting';

describe('error reporting (Sentry envelope)', () => {
  const DSN = 'https://abc123@o42.ingest.sentry.io/4505';

  it('parses a Sentry DSN into the envelope endpoint', () => {
    expect(parseSentryDsn(DSN)).toEqual({
      envelopeUrl: 'https://o42.ingest.sentry.io/api/4505/envelope/',
      publicKey: 'abc123',
      dsn: DSN,
    });
    expect(parseSentryDsn('')).toBeNull();
    expect(parseSentryDsn('not a url')).toBeNull();
    expect(parseSentryDsn('https://o42.ingest.sentry.io/4505')).toBeNull();
  });

  it('is a no-op without SENTRY_DSN', async () => {
    const fetchFn = jest.fn();
    await expect(reportError(new Error('boom'), {}, {}, fetchFn as never)).resolves.toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('tags events with service, environment and release', () => {
    setErrorReportingService('ride-service');
    const event = buildSentryEvent(
      new TypeError('fare missing'),
      { method: 'POST', path: '/api/rides', status: 500, requestId: 'req-1' },
      { APP_ENV: 'production', RENDER_GIT_COMMIT: 'abc' },
    );
    expect(event).toMatchObject({
      level: 'error',
      environment: 'production',
      release: 'abc',
      tags: { service: 'ride-service', status: '500', method: 'POST' },
      transaction: 'POST /api/rides',
      exception: { values: [{ type: 'TypeError', value: 'fare missing' }] },
      extra: { requestId: 'req-1' },
    });
  });

  it('posts an envelope once per distinct error per minute', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true });
    const env = { SENTRY_DSN: DSN };
    await expect(reportError(new Error('db down'), { path: '/x' }, env, fetchFn as never)).resolves.toBe(true);
    await expect(reportError(new Error('db down'), { path: '/x' }, env, fetchFn as never)).resolves.toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://o42.ingest.sentry.io/api/4505/envelope/');
    expect(init.headers['X-Sentry-Auth']).toContain('sentry_key=abc123');
    const lines = String(init.body).split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1])).toEqual({ type: 'event' });
    expect(JSON.parse(lines[2]).exception.values[0].value).toBe('db down');
  });

  it('never throws when Sentry is unreachable', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(
      reportError(new Error('unique failure'), {}, { SENTRY_DSN: DSN }, fetchFn as never),
    ).resolves.toBe(false);
  });
});
