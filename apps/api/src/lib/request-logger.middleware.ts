import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createLogger } from './logger';

const logger = createLogger('http');

/**
 * Runs after RequestIdMiddleware (which must be first in the chain) so the
 * requestId is already attached to AsyncLocalStorage and the response header
 * by the time these logs are emitted.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const originalSend = res.send;

    res.send = function (data: unknown) {
      const duration = Date.now() - start;
      logger.info('Request completed', {
        payload: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
        },
        durationMs: duration,
      });
      return originalSend.call(this, data);
    };

    logger.info('Request started', {
      payload: {
        method: req.method,
        path: req.path,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
      },
    });

    next();
  }
}
