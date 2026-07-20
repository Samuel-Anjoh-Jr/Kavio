import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createLogger, setRequestId } from './logger';
import { randomUUID } from 'crypto';

const logger = createLogger('http');

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.headers['x-request-id'] || randomUUID();
    setRequestId(String(requestId));

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
