import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { setRequestId } from './logger';

declare module 'express' {
  interface Request {
    requestId?: string;
  }
}

const REQUEST_ID_HEADER = 'x-request-id';
const VALID_REQUEST_ID = /^[a-zA-Z0-9-]{1,100}$/;

/**
 * First middleware in the chain: assigns a requestId (trusting an incoming
 * x-request-id only if it matches a safe shape), stores it on the request and
 * in AsyncLocalStorage so every downstream log line and error response can
 * include it, and echoes it back on the response for client-side correlation.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
    const requestId = candidate && VALID_REQUEST_ID.test(candidate) ? candidate : randomUUID();

    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    setRequestId(requestId);

    next();
  }
}
