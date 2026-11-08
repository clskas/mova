import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';
import { Observable, tap } from 'rxjs';

/** Keys never written to the audit log (codes, secrets). */
const SECRET_KEY_RE = /(pin|password|secret|token|apikey|api_key|otp|code)$/i;
const MAX_STRING = 300;

/** Copy of a request body safe for the audit log: no secrets, short strings, small arrays. */
export function auditSafeBody(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value !== 'object') return value;
  if (depth >= 3) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => auditSafeBody(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY_RE.test(k) ? '***' : auditSafeBody(v, depth + 1);
  }
  return out;
}

/**
 * « Qui a fait quoi » : every successful change made in the admin (POST / PATCH / PUT / DELETE)
 * is written to the audit log — the admin, the action (method + route), the target id and the
 * request (without secrets). Money moves (wallet adjust, withdraw, top-up, mark paid, debts)
 * were not traced before. Never blocks or fails the request.
 */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AdminAuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      route?: { path?: string };
      originalUrl?: string;
      params?: Record<string, string>;
      body?: unknown;
      user?: { id?: string; role?: string };
      ip?: string;
    }>();
    const method = String(req?.method ?? 'GET').toUpperCase();
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) || !req?.user?.id) return next.handle();
    const route = String(req.route?.path ?? req.originalUrl ?? '').replace(/^\/?(api\/)?admin\/?/, '');
    // Read-like POSTs (AI drafts, searches) are not changes.
    if (/^(ai\/|search|fraud\/alerts|staff-alerts\/evaluate)/.test(route)) return next.handle();
    const params = req.params ?? {};
    const resourceId = params.id ?? params.userId ?? params.debtId ?? params.documentId ?? params.vehicleType ?? params.category ?? params.type;
    const resourceType = route.split('/')[0] || 'admin';
    return next.handle().pipe(
      tap({
        next: () => {
          void fetch(serviceUrl('auth', '/internal/audit'), {
            method: 'POST',
            headers: { 'x-internal-api-key': INTERNAL_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              actorUserId: req.user!.id,
              action: `${method} ${route}`.slice(0, 120),
              resourceType,
              resourceId,
              meta: { role: req.user!.role, body: auditSafeBody(req.body) },
              ip: req.ip,
            }),
          }).catch((e: unknown) => this.logger.debug(`audit skipped: ${e instanceof Error ? e.message : String(e)}`));
        },
      }),
    );
  }
}
