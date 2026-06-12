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

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      return response.status(status).json({
        success: false,
        error: {
          code: MovaErrorCode.VALIDATION_ERROR,
          message:
            typeof body === 'string'
              ? body
              : (body as { message?: string | string[] }).message ?? 'Erreur de validation',
        },
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
