// One-time bootstrap: grants the ADMIN role to one named, existing identity.
// No screen in the app can mint the first admin (an admin is created by another
// admin), so a fresh production database needs this once. Run by a human from a
// trusted shell:  PROMOTE_EMAIL=you@example.com pnpm db:admin:promote
// Deliberately narrow: exact email match, idempotent, and always audit-logged.
import { PrismaClient } from '@prisma/client';

const email = (process.env.PROMOTE_EMAIL ?? process.argv[2] ?? '').trim().toLowerCase();
if (!email) {
  console.error('Missing PROMOTE_EMAIL (or pass the email as the first argument).');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user found with email: ${email}`);
  if (user.status !== 'ACTIVE') {
    throw new Error(`${email} is ${user.status}; only ACTIVE accounts can be promoted.`);
  }

  const existing = await prisma.userRole.findUnique({
    where: { userId_role: { userId: user.id, role: 'ADMIN' } },
  });
  if (existing) {
    console.log(`${email} already holds the ADMIN role. Nothing to do.`);
  } else {
    // Added inactive: the identity keeps its current active role and switches to
    // ADMIN through the normal role switcher, so nothing changes under their feet.
    await prisma.$transaction([
      prisma.userRole.create({ data: { userId: user.id, role: 'ADMIN', isActive: false } }),
      prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'user.promote_admin',
          target: user.id,
          meta: { email, source: 'cli' },
        },
      }),
    ]);
    console.log(`Granted ADMIN to ${email}. They can switch to it from the role switcher.`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
