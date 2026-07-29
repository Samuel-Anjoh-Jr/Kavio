import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, prisma } from '@kavio/database';

/**
 * Exposes the shared Prisma client (from @kavio/database) as an injectable
 * NestJS provider. Uses the singleton so the whole API shares one connection
 * pool. Feature modules inject PrismaService for DB access.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient = prisma;

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
