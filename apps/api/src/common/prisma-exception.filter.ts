import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@oryx/database';

/**
 * Translates Prisma errors into HTTP responses.
 *
 * A Prisma validation error is the caller's mistake: an unvalidated `?status=`
 * string, a malformed id or a NaN reaching a numeric filter all fail inside
 * Prisma and would otherwise surface as a 500 "Internal server error". The
 * contract is that a malformed request is a 400, so map it here once rather than
 * re-deriving the same rule at every call site.
 *
 * Anything else — a genuine bug — stays a 500 and the detail is logged, never
 * returned, so an internal message cannot leak through the response body.
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const status =
        exception.code === 'P2025'
          ? HttpStatus.NOT_FOUND
          : exception.code === 'P2002'
            ? HttpStatus.CONFLICT
            : exception.code === 'P2003' || exception.code === 'P2023'
              ? HttpStatus.BAD_REQUEST
              : HttpStatus.INTERNAL_SERVER_ERROR;
      const code =
        status === HttpStatus.NOT_FOUND
          ? 'resource.not_found'
          : status === HttpStatus.CONFLICT
            ? 'resource.conflict'
            : status === HttpStatus.BAD_REQUEST
              ? 'request.validation_failed'
              : 'server.internal_error';
      const message =
        status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'Internal server error'
          : 'The request could not be completed as sent.';
      if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
        // eslint-disable-next-line no-console
        console.error('[PrismaExceptionFilter]', exception.code, exception.message);
      }
      response.status(status).json({ statusCode: status, message, code });
      return;
    }

    // PrismaClientValidationError: the query shape or a value was rejected.
    // eslint-disable-next-line no-console
    console.warn('[PrismaExceptionFilter] validation rejected:', (exception as Error).message?.split('\n').slice(-1)[0]);
    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'The request could not be completed as sent.',
      code: 'request.validation_failed',
    });
  }
}
