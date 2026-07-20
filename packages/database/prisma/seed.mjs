// Seed skeleton. Idempotent by design so it is safe to re-run (upserts, no throws
// on existing rows). Later prompts extend this with their own seed data.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ADMIN_EMAIL = 'admin@trustpro.local';

  // Bootstrap a platform admin identity so the very first admin actions
  // (taxonomy, tier config, verification pipeline) have an actor to attribute.
  // Fully idempotent: only create + audit-log when the identity is absent, so
  // re-running the seed never duplicates rows.
  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (existing) {
    console.log(`Seed already applied. Admin identity: ${existing.id}`);
    return;
  }

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      name: 'TrustPro Admin',
      locale: 'en',
      status: 'ACTIVE',
      roles: {
        create: [{ role: 'ADMIN', isActive: true }],
      },
    },
    include: { roles: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: 'seed.bootstrap',
      target: `User:${admin.id}`,
      meta: { roles: admin.roles.map((r) => r.role) },
    },
  });

  console.log(`Seed complete. Admin identity: ${admin.id}`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
