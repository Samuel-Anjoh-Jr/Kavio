import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './lib/all-exceptions.filter';
import { getAllowedOrigins } from './lib/cors.config';
import { RedisIoAdapter } from './realtime/redis-io.adapter';
import { RedisService } from './redis/redis.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new AllExceptionsFilter());

  // Same allowlist as the WS gateways (lib/cors.config) — a request from an
  // origin not on it gets no Access-Control-Allow-Origin header, so browsers
  // block the response even though the API itself still processed it.
  app.enableCors({ origin: getAllowedOrigins() });

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
