import { PrismaClient } from '@prisma/client';

/**
 * Shared Prisma client for web + api. A single instance is reused across hot
 * reloads (dev) via a global, so we never exhaust the connection pool. Later
 * prompts import models + the `prisma` singleton from `@kavio/database`.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export the generated types + enums so consumers import everything from one
// place and never depend on `@prisma/client` directly.
export * from '@prisma/client';
