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

  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
