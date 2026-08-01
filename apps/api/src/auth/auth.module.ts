import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { ProfileService } from './profile.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

/**
 * Auth module (SRS §11; ACC-04 → ACC-09).
 *
 * Marked @Global because the guards are registered application-wide in
 * AppModule: every feature module added later is protected by default, and none
 * of them has to import this one to get that.
 *
 * JwtModule is registered with NO default secret on purpose — TokenService
 * passes the access or refresh secret explicitly on every call, so the two can
 * never be silently interchanged by an omitted option.
 */
@Global()
@Module({
  imports: [PrismaModule, NotificationsModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    PasswordService,
    ProfileService,
    SessionService,
    TokenService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    OtpService,
    ProfileService,
    SessionService,
    TokenService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
