import { randomUUID } from 'crypto';

/**
 * Minimal Sentry reporter (envelope HTTP API) — no SDK dependency.
 *
 * Inactive until SENTRY_DSN is set. Reports 5xx / unexpected errors from
 * HttpExceptionFilter and process-level crashes, tagged with the service name,
 * environment (APP_ENV) and release (Render git commit). Never throws.
 */

type ParsedDsn = { envelopeUrl: string; publicKey: string; dsn: string };

export type ErrorReportContext = {
  requestId?: string;
  path?: string;
  method?: string;
  status?: number;
  tags?: Record<string, string>;
};

const DEDUPE_WINDOW_MS = 60_000;
const SEND_TIMEOUT_MS = 3_000;

let serviceName = 'unknown-service';
const recent = new Map<string, number>();

export function parseSentryDsn(dsn: string | undefined): ParsedDsn | null {
  const raw = (dsn ?? '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const projectId = u.pathname.replace(/^\/+|\/+$/g, '').split('/').pop();
    if (!u.username || !projectId) return null;
    const prefix = u.pathname.replace(/\/?[^/]+\/?$/, '');
    return {
      envelopeUrl: `${u.protocol}//${u.host}${prefix}/api/${projectId}/envelope/`,
      publicKey: u.username,
      dsn: raw,
    };
  } catch {
    return null;
  }
}

function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : JSON.stringify(error ?? 'unknown error'));
}

/** Sentry event payload for one error (exported for tests). */
export function buildSentryEvent(
  error: unknown,
  context: ErrorReportContext = {},
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
) {
  const err = asError(error);
  return {
    event_id: randomUUID().replace(/-/g, ''),
    timestamp: now.toISOString(),
    platform: 'node',
    level: 'error',
    logger: serviceName,
    server_name: serviceName,
    environment: env.APP_ENV?.trim() || env.NODE_ENV?.trim() || 'development',
    release: env.RENDER_GIT_COMMIT?.trim() || env.GIT_COMMIT?.trim() || undefined,
    tags: {
      service: serviceName,
      ...(context.status ? { status: String(context.status) } : {}),
      ...(context.method ? { method: context.method } : {}),
      ...(context.tags ?? {}),
    },
    transaction: context.path ? `${context.method ?? ''} ${context.path}`.trim() : undefined,
    exception: {
      values: [{ type: err.name || 'Error', value: err.message.slice(0, 2000) }],
    },
    extra: {
      ...(context.requestId ? { requestId: context.requestId } : {}),
      ...(err.stack ? { stack: err.stack.slice(0, 8000) } : {}),
    },
  };
}

/** Name used for tags on every report from this process. */
export function setErrorReportingService(name: string): void {
  serviceName = name;
}

/** Send an error to Sentry (fire-and-forget). Resolves true when accepted. */
export async function reportError(
  error: unknown,
  context: ErrorReportContext = {},
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const dsn = parseSentryDsn(env.SENTRY_DSN);
  if (!dsn) return false;
  const err = asError(error);
  // A broken dependency can fail every request: report each distinct error once a minute.
  const key = `${err.name}:${err.message}:${context.path ?? ''}`;
  const nowMs = Date.now();
  const last = recent.get(key);
  if (last && nowMs - last < DEDUPE_WINDOW_MS) return false;
  recent.set(key, nowMs);
  if (recent.size > 500) recent.clear();

  const event = buildSentryEvent(err, context, env);
  const body = [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn: dsn.dsn }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');
  try {
    const res = await fetchFn(dsn.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=mova-reporter/1.0`,
      },
      body,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let installed = false;

/**
 * Report process-level crashes, then exit like Node would have.
 * Call once at bootstrap, right after assertProductionSecurity().
 */
export function installErrorReporting(name: string): void {
  setErrorReportingService(name);
  if (installed || !parseSentryDsn(process.env.SENTRY_DSN)) return;
  installed = true;
  const crash = (kind: string) => (error: unknown) => {
    console.error(`[${name}] ${kind}:`, error);
    void reportError(error, { tags: { crash: kind } }).finally(() => process.exit(1));
    // Never hang on a slow network: exit anyway.
    setTimeout(() => process.exit(1), SEND_TIMEOUT_MS + 500).unref();
  };
  process.on('uncaughtException', crash('uncaughtException'));
  process.on('unhandledRejection', crash('unhandledRejection'));
}
