import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { REQUEST_ID_HEADER, RequestWithId } from './request-id.middleware';
import { MovaErrorCode, MOVA_ERROR_MESSAGES } from './mova-error-codes';

export class MovaHttpException extends HttpException {
  constructor(
    public readonly code: MovaErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    message?: string,
  ) {
    super(
      {
        code,
        message: message ?? MOVA_ERROR_MESSAGES[code],
      },
      status,
    );
  }
}

function isNestHttpException(exception: unknown): exception is HttpException {
  return (
    exception instanceof HttpException ||
    (typeof exception === 'object' &&
      exception !== null &&
      'getStatus' in exception &&
      typeof (exception as HttpException).getStatus === 'function')
  );
}

const TECHNICAL_OR_NEST_ENGLISH = [
  /^Forbidden resource$/i,
  /^Unauthorized$/i,
  /^Forbidden$/i,
  /^Bad Request$/i,
  /^Not Found$/i,
  /^Internal server error$/i,
  /PrismaClient/i,
  /\bPrisma\b/,
  /NestJS/i,
  /ECONNREFUSED/i,
  /Unique constraint/i,
  /Foreign key constraint/i,
  /Exception:/i,
  /^\s*at\s+\S+/m,
];

function extractHttpMessage(body: string | object): string {
  if (typeof body === 'string') return body;
  const msg = (body as { message?: string | string[] }).message;
  if (Array.isArray(msg)) return msg.join('. ');
  if (typeof msg === 'string') return msg;
  return 'Erreur de validation';
}

/** Never expose Nest/Prisma/English internals to API clients. */
function toPublicHttpMessage(raw: string, status: number): string {
  const msg = (raw ?? '').trim();
  if (!msg || msg.length > 180 || TECHNICAL_OR_NEST_ENGLISH.some((re) => re.test(msg))) {
    if (status === HttpStatus.UNAUTHORIZED) {
      return MOVA_ERROR_MESSAGES[MovaErrorCode.AUTH_UNAUTHORIZED];
    }
    if (status === HttpStatus.FORBIDDEN) {
      return MOVA_ERROR_MESSAGES[MovaErrorCode.AUTH_FORBIDDEN];
    }
    if (status === HttpStatus.NOT_FOUND) {
      return MOVA_ERROR_MESSAGES[MovaErrorCode.NOT_FOUND];
    }
    if (status >= 500) {
      return MOVA_ERROR_MESSAGES[MovaErrorCode.INTERNAL_ERROR];
    }
    return MOVA_ERROR_MESSAGES[MovaErrorCode.VALIDATION_ERROR];
  }
  return msg;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  private requestTag(host: ArgumentsHost): string {
    const req = host.switchToHttp().getRequest<RequestWithId>();
    const id = req.requestId ?? req.headers[REQUEST_ID_HEADER];
    const raw = Array.isArray(id) ? id[0] : id;
    return raw ? `[${raw}] ` : '';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const tag = this.requestTag(host);

    if (exception instanceof MovaHttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as { code: string; message: string };
      this.logger.warn(`${tag}${body.code}: ${body.message}`);
      return response.status(status).json({
        success: false,
        error: body,
        timestamp: new Date().toISOString(),
      });
    }

    if (isNestHttpException(exception)) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const rawMessage = extractHttpMessage(body);
      const message = toPublicHttpMessage(rawMessage, status);
      const code =
        status === HttpStatus.NOT_FOUND
          ? MovaErrorCode.NOT_FOUND
          : status === HttpStatus.UNAUTHORIZED
            ? MovaErrorCode.AUTH_UNAUTHORIZED
            : status === HttpStatus.FORBIDDEN
              ? MovaErrorCode.AUTH_FORBIDDEN
              : status >= 500
                ? MovaErrorCode.INTERNAL_ERROR
                : MovaErrorCode.VALIDATION_ERROR;
      if (status >= 500) this.logger.error(`${tag}${code}: ${rawMessage}`, exception);
      else this.logger.warn(`${tag}${code}: ${rawMessage}`);
      return response.status(status).json({
        success: false,
        error: { code, message },
        timestamp: new Date().toISOString(),
      });
    }

    if (exception instanceof Error) {
      this.logger.error(`${tag}${exception.message}`, exception.stack);
      if (exception.message.includes('entity too large')) {
        const message = 'Fichier trop volumineux (max 3 Mo pour les photos colis).';
        this.logger.warn(`${tag}${MovaErrorCode.VALIDATION_ERROR}: ${message}`);
        return response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
          success: false,
          error: { code: MovaErrorCode.VALIDATION_ERROR, message },
          timestamp: new Date().toISOString(),
        });
      }
      const message =
        exception.message.includes('Tarif non configuré') ||
        exception.message.includes('non configuré')
          ? MOVA_ERROR_MESSAGES[MovaErrorCode.PRICING_NOT_CONFIGURED]
          : MOVA_ERROR_MESSAGES[MovaErrorCode.INTERNAL_ERROR];
      const code =
        message === MOVA_ERROR_MESSAGES[MovaErrorCode.PRICING_NOT_CONFIGURED]
          ? MovaErrorCode.PRICING_NOT_CONFIGURED
          : MovaErrorCode.INTERNAL_ERROR;
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: { code, message },
        timestamp: new Date().toISOString(),
      });
    }

    this.logger.error(`${tag}Unhandled exception`, exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: MovaErrorCode.INTERNAL_ERROR,
        message: MOVA_ERROR_MESSAGES[MovaErrorCode.INTERNAL_ERROR],
      },
      timestamp: new Date().toISOString(),
    });
  }
}
