import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './lib/all-exceptions.filter';
import { RedisIoAdapter } from './realtime/redis-io.adapter';
import { RedisService } from './redis/redis.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new AllExceptionsFilter());

  // Back the WS gateways with the Redis pub/sub adapter so broadcasts fan out
  // across every API instance (horizontal scaling).
  app.useWebSocketAdapter(new RedisIoAdapter(app, app.get(RedisService)));

  // Let RedisModule/QueueModule close their connections cleanly on SIGTERM.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  new Logger('Bootstrap').log(`Listening on http://localhost:${port}`);
}
void bootstrap();
