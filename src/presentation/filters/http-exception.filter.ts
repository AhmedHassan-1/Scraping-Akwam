import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException, JobNotFoundException } from '../../core/errors/domain.exception';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.id || (request.headers['x-request-id'] as string) || undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'حدث خطأ غير متوقع في السيرفر، يرجى المحاولة لاحقاً';
    let errors: any = null;

    if (exception instanceof JobNotFoundException) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
    } else if (exception instanceof DomainException) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        message = (res as any).message || exception.message;
        errors = (res as any).message;
      } else {
        message = exception.message;
      }
    }

    // Mask sensitive details on 500 errors in response to clients
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      message = 'حدث خطأ داخلي في معالجة طلبك، يرجى المحاولة لاحقاً';
      errors = null;
    }

    this.logger.error(
      `[ReqID: ${requestId || 'N/A'}] HTTP ${status} [${request.method} ${request.url}]: ${
        exception instanceof Error ? exception.message : String(exception)
      }`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      statusCode: status,
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: Array.isArray(errors) ? errors[0] : message,
    });
  }
}
