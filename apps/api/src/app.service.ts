import { Injectable } from '@nestjs/common';
import { createLogger } from './lib/logger';

const logger = createLogger('AppService');

@Injectable()
export class AppService {
  getHello(): string {
    logger.info('Handling getHello request', {
      payload: { endpoint: '/' },
    });
    return 'Hello World!';
  }
}
