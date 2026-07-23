import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { GqlArgumentsHost, GqlContextType } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { createLogger, getRequestId } from './logger';
import { AppException } from './app-exception';
import { ErrorResponseBody, httpStatusToCode } from './error-contract';

const logger = createLogger('exception-filter');
const REQUEST_ID_HEADER = 'x-request-id';
const GENERIC_MESSAGE = 'An unexpected error occurred. Please try again.';

interface ResolvedError {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string[]>;
}

/**
 * Global filter: every thrown error (REST) is converted into the typed
 * { error: { code, message, requestId, fields? } } contract, the same
 * requestId is echoed on the x-request-id header, and the full original
 * error is logged server-side (never sent to the client) so it can be
 * correlated with the response via requestId.
 *
 * Registered globally, this also catches exceptions thrown inside GraphQL
 * resolvers — but `host.switchToHttp()` has no request/response to give there
 * (GraphQL isn't the HTTP context; it's a distinct one laid over the same POST
 * /graphql call), so writing a REST-shaped response would crash on `undefined`
 * and bury whatever the resolver actually threw. For that context this filter
 * only logs and re-throws, leaving the client-facing envelope to
 * `formatGraphQLError` (the same typed contract, built by graphql-js's own
 * error path instead of an HTTP response object).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType<GqlContextType>() === 'graphql') {
      const gqlRequest = GqlArgumentsHost.create(host).getContext<{ req?: Request }>().req;
      const resolved = this.resolve(exception);

      logger.error('Request failed', {
        payload: {
          method: gqlRequest?.method,
          path: gqlRequest?.path,
          statusCode: resolved.status,
        },
        error: exception,
      });

      throw exception;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = getRequestId() ?? 'unknown';

    const resolved = this.resolve(exception);

    logger.error('Request failed', {
      payload: { method: request.method, path: request.path, statusCode: resolved.status },
      error: exception,
    });

    const body: ErrorResponseBody = {
      error: {
        code: resolved.code,
        message: resolved.message,
        requestId,
        ...(resolved.fields ? { fields: resolved.fields } : {}),
      },
    };

    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.status(resolved.status).json(body);
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        fields: exception.fields,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message = this.extractMessage(payload, exception.message);

      return { status, code: httpStatusToCode(status), message };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: GENERIC_MESSAGE,
    };
  }

  private extractMessage(payload: unknown, fallback: string): string {
    if (typeof payload === 'string') {
      return payload;
    }
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = payload.message;
      if (Array.isArray(message)) {
        return message.join('; ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }
    return fallback;
  }
}
