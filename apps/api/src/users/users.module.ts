import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';

/**
 * Users / roles module (SRS §16 "users / roles"): the identity graph, multi-role
 * membership and the RBAC-relevant reads. Writes live in AuthModule.
 */
@Module({
  imports: [PrismaModule],
  providers: [UsersResolver, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
