import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { NestFactory } from '@nestjs/core';
import { Role, UserStatus, VerificationTier } from '@kavio/database';
import { printSchema } from 'graphql';
import { registerGraphQLEnums } from '../graphql/enums';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';

registerGraphQLEnums();

const CURRENT: AuthenticatedUser = {
  id: 'user-1',
  activeRole: Role.WORKER,
  roles: [Role.WORKER, Role.CLIENT],
  tier: VerificationTier.TIER_2,
  status: UserStatus.ACTIVE,
  sessionId: 'session-1',
};

const ROW = {
  id: 'user-1',
  phone: '+237655555555',
  email: 'ada@example.cm',
  name: 'Ada',
  avatar: null,
  locale: 'fr',
  status: UserStatus.ACTIVE,
  tier: VerificationTier.TIER_2,
  trustScore: 68,
  twoFactorEnabled: false,
  phoneVerifiedAt: new Date('2026-07-01'),
  emailVerifiedAt: null,
  createdAt: new Date('2026-06-01'),
  roles: [
    { role: Role.WORKER, isActive: true, createdAt: new Date('2026-06-01') },
    { role: Role.CLIENT, isActive: false, createdAt: new Date('2026-06-15') },
  ],
};

function makePrisma(user: unknown = ROW): { prisma: PrismaService; findUnique: jest.Mock } {
  const findUnique = jest.fn().mockResolvedValue(user);

  return {
    prisma: { client: { user: { findUnique } } } as unknown as PrismaService,
    findUnique,
  };
}

/**
 * Building the schema is the only thing that proves the code-first decorators
 * actually assemble — a missing registerEnumType or an unresolvable field type
 * typechecks perfectly and then fails at boot.
 */
describe('GraphQL schema', () => {
  it('builds the me query with the identity graph', async () => {
    const app = await NestFactory.create(GraphQLSchemaBuilderModule, { logger: false });
    await app.init();

    const schema = await app.get(GraphQLSchemaFactory).create([UsersResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('me: Me!');
    expect(sdl).toContain('activeRole: Role!');
    expect(sdl).toContain('tier: VerificationTier!');
    expect(sdl).toContain('trustScore: Int!');
    expect(sdl).toContain('roles: [RoleGrant!]!');
    expect(sdl).toContain('enum VerificationTier');

    await app.close();
  });
});

describe('UsersService.findMe', () => {
  it('returns the identity graph with tier and Trust Score on the identity', async () => {
    const service = new UsersService(makePrisma().prisma);

    const me = await service.findMe(CURRENT);

    expect(me.id).toBe('user-1');
    expect(me.tier).toBe(VerificationTier.TIER_2);
    expect(me.trustScore).toBe(68);
    expect(me.roles.map((grant) => grant.role)).toEqual([Role.WORKER, Role.CLIENT]);
  });

  it('reports the active role from the TOKEN, not the database row', async () => {
    // The session made every authorisation decision this request against CLIENT,
    // so `me` must agree with the token even though the row still flags WORKER.
    const service = new UsersService(makePrisma().prisma);

    const me = await service.findMe({ ...CURRENT, activeRole: Role.CLIENT });

    expect(me.activeRole).toBe(Role.CLIENT);
    expect(me.roles.find((grant) => grant.isActive)?.role).toBe(Role.CLIENT);
  });

  it('falls back to a held role when the claimed one was revoked', async () => {
    const service = new UsersService(makePrisma().prisma);

    // ADMIN is not in the row's grants — the token outlived a revocation.
    const me = await service.findMe({ ...CURRENT, activeRole: Role.ADMIN });

    expect(me.activeRole).toBe(Role.WORKER);
    expect(me.permissions).not.toContain('admin:access');
  });

  it('exposes the ACTIVE role permissions so the UI can hide impossible actions', async () => {
    const service = new UsersService(makePrisma().prisma);

    const asWorker = await service.findMe(CURRENT);
    const asClient = await service.findMe({ ...CURRENT, activeRole: Role.CLIENT });

    expect(asWorker.permissions).toContain('job:apply');
    expect(asWorker.permissions).not.toContain('job:create');
    expect(asClient.permissions).toContain('job:create');
    expect(asClient.permissions).not.toContain('job:apply');
  });

  it('never selects the password hash', async () => {
    const { prisma, findUnique } = makePrisma();
    const service = new UsersService(prisma);

    await service.findMe(CURRENT);

    const args = findUnique.mock.calls[0] as [{ select: Record<string, unknown> }];

    expect(args[0].select).not.toHaveProperty('passwordHash');
  });
});
