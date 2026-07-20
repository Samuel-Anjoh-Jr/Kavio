import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Auth module (SRS §11, ACC-04). Owns sign-up today; OTP verification, JWT
 * sessions, password reset and RBAC arrive in later prompts and extend this
 * module. AuthService is exported for reuse by those prompts.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
