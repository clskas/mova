import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
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

function extractHttpMessage(body: string | object): string {
  if (typeof body === 'string') return body;
  const msg = (body as { message?: string | string[] }).message;
  if (Array.isArray(msg)) return msg.join('. ');
  if (typeof msg === 'string') return msg;
  return 'Erreur de validation';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof MovaHttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as { code: string; message: string };
      this.logger.warn(`${body.code}: ${body.message}`);
      return response.status(status).json({
        success: false,
        error: body,
        timestamp: new Date().toISOString(),
      });
    }

    if (isNestHttpException(exception)) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = extractHttpMessage(body);
      const code =
        status === HttpStatus.NOT_FOUND
          ? MovaErrorCode.NOT_FOUND
          : status === HttpStatus.UNAUTHORIZED
            ? MovaErrorCode.AUTH_UNAUTHORIZED
            : MovaErrorCode.VALIDATION_ERROR;
      if (status >= 500) this.logger.error(`${code}: ${message}`, exception);
      else this.logger.warn(`${code}: ${message}`);
      return response.status(status).json({
        success: false,
        error: { code, message },
        timestamp: new Date().toISOString(),
      });
    }

    if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
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

    this.logger.error('Unhandled exception', exception);
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
