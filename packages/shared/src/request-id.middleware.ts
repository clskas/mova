import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export type RequestWithId = Request & { requestId?: string };

export function getOrCreateRequestId(req: Request): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const raw = Array.isArray(incoming) ? incoming[0] : incoming;
  const trimmed = raw?.trim();
  return trimmed || randomUUID();
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestIdMiddleware.name);

  use(req: RequestWithId, res: Response, next: NextFunction) {
    const requestId = getOrCreateRequestId(req);
    req.requestId = requestId;
    req.headers[REQUEST_ID_HEADER] = requestId;
    res.setHeader('X-Request-Id', requestId);
    this.logger.log(`${req.method} ${req.originalUrl ?? req.url} [${requestId}]`);
    next();
  }
}
