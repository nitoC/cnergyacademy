import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/**
 * Uniform error envelope: { statusCode, code, message, details? }.
 * Unknown errors are logged with context and returned as a generic 500 so
 * internals never leak to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong. Please try again.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = defaultCode(status);
      } else {
        const b = body as Record<string, unknown>;
        code = (b.code as string) ?? defaultCode(status);
        if (Array.isArray(b.message)) {
          message = 'Some fields are invalid';
          details = b.message;
          code = 'VALIDATION_FAILED';
        } else {
          message = (b.message as string) ?? message;
        }
        if (b.details) details = b.details;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'ALREADY_EXISTS';
        message = 'A record with these details already exists';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Resource not found';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        code = 'IN_USE';
        message = 'This record is referenced by other records';
      } else {
        this.logger.error({ msg: 'Prisma error', code: exception.code, path: req.url });
      }
    } else {
      const err = exception as Error;
      this.logger.error({ msg: err?.message ?? 'Unknown error', stack: err?.stack, path: req.url, method: req.method });
    }

    res.status(status).json({ statusCode: status, code, message, ...(details ? { details } : {}) });
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'AUTHENTICATION_REQUIRED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 429: return 'RATE_LIMITED';
    default: return 'ERROR';
  }
}
