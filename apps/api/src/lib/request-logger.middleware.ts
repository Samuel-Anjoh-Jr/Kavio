import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createLogger } from './logger';

const logger = createLogger('http');

/**
 * Runs after RequestIdMiddleware (which must be first in the chain) so the
 * requestId is already attached to AsyncLocalStorage and the response header
 * by the time these logs are emitted.
 */
/**
 * Platform and keep-alive probes hit these paths every few seconds for as
 * long as the service runs — Render's configured health check on `/health`
 * (render.yaml), and whatever else polls the public root `/` to stop a free
 * instance from spinning down. Logging either at the same level as real
 * traffic drowns whatever a human is actually looking for in a wall of
 * identical, uninformative lines, so these are the paths this middleware
 * deliberately stays silent on.
 */
const UNLOGGED_PATHS = new Set(['/health', '/']);

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (UNLOGGED_PATHS.has(req.path)) {
      next();
      return;
    }

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
