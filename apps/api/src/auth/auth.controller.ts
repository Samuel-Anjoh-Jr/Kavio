import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@kavio/database';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { AuthService, LoginResult, SignUpResult } from './auth.service';
import type { AuthenticatedUser, SessionTokens } from './auth.types';
import { CurrentUser, Public } from './decorators/auth.decorators';
import {
  addRoleSchema,
  changePasswordSchema,
  changePhoneSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  requestOtpSchema,
  resetPasswordSchema,
  switchRoleSchema,
  toggleTwoFactorSchema,
  twoFactorVerifySchema,
  updateProfileSchema,
  verifyOtpSchema,
} from './dto/auth.dto';
import type {
  AddRoleDto,
  ChangePasswordDto,
  ChangePhoneDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RequestOtpDto,
  ResetPasswordDto,
  SwitchRoleDto,
  ToggleTwoFactorDto,
  TwoFactorVerifyDto,
  UpdateProfileDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import { signUpSchema } from './dto/sign-up.dto';
import type { SignUpDto } from './dto/sign-up.dto';
import type { OtpIssueResult } from './otp.service';
import { PasswordService } from './password.service';
import { ProfileService } from './profile.service';
import { SessionService } from './session.service';

/**
 * Auth writes (REST, per the DUAL API RULE — every mutation is REST; reads live
 * in GraphQL). The identity graph is served by the `me` query in UsersModule.
 *
 * Rate limits here are deliberately far below the global default: these are the
 * endpoints worth attacking, and the limit is part of what makes a 6-digit code
 * strong enough at all (SRS §18, ACC-05).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwords: PasswordService,
    private readonly profile: ProfileService,
    private readonly sessions: SessionService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Registration + verification (ACC-04)
  // ───────────────────────────────────────────────────────────────────────────

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async signUp(@Body(new ZodValidationPipe(signUpSchema)) dto: SignUpDto): Promise<SignUpResult> {
    return this.authService.signUp(dto);
  }

  /**
   * Requests a one-time code. The per-user cooldown lives in OtpService; this
   * IP-level limit is the outer wall that stops one host cycling many identifiers.
   */
  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async requestOtp(
    @Body(new ZodValidationPipe(requestOtpSchema)) dto: RequestOtpDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<OtpIssueResult> {
    return this.authService.requestOtp(dto, parseLocale(acceptLanguage));
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema)) dto: VerifyOtpDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<SessionTokens> {
    return this.authService.verifyOtp(dto, userAgent);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sessions (ACC-05, ACC-09)
  // ───────────────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResult> {
    return this.authService.login(dto, userAgent);
  }

  @Public()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async verifyTwoFactor(
    @Body(new ZodValidationPipe(twoFactorVerifySchema)) dto: TwoFactorVerifyDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<SessionTokens> {
    return this.authService.verifyTwoFactor(dto, userAgent);
  }

  /**
   * Rotates the refresh token. Public because the access token is, by definition,
   * already expired by the time a client needs this — requiring a valid one would
   * make refresh impossible exactly when it matters.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<SessionTokens> {
    return this.sessions.refresh(dto.refreshToken, userAgent);
  }

  /** Idempotent: logging out with a dead token is still a successful logout. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body(new ZodValidationPipe(logoutSchema)) dto: LogoutDto): Promise<void> {
    await this.sessions.revoke(dto.refreshToken);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Password (ACC-08)
  // ───────────────────────────────────────────────────────────────────────────

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<{ sent: true }> {
    return this.passwords.forgotPassword(dto, parseLocale(acceptLanguage));
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
  ): Promise<{ reset: true }> {
    return this.passwords.resetPassword(dto);
  }

  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto,
  ): Promise<{ changed: true }> {
    return this.passwords.changePassword(user.id, dto);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Profile (name, phone)
  // ───────────────────────────────────────────────────────────────────────────

  @Post('profile')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ): Promise<{ name: string }> {
    return this.profile.updateName(user.id, dto);
  }

  @Post('phone')
  @HttpCode(HttpStatus.OK)
  async changePhone(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePhoneSchema)) dto: ChangePhoneDto,
  ): Promise<{ phone: string }> {
    return this.profile.changePhone(user.id, dto);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Two-factor (ACC-08)
  // ───────────────────────────────────────────────────────────────────────────

  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  async enableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(toggleTwoFactorSchema)) dto: ToggleTwoFactorDto,
  ): Promise<{ twoFactorEnabled: boolean }> {
    return this.authService.setTwoFactor(user.id, true, dto);
  }

  @Delete('2fa')
  @HttpCode(HttpStatus.OK)
  async disableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(toggleTwoFactorSchema)) dto: ToggleTwoFactorDto,
  ): Promise<{ twoFactorEnabled: boolean }> {
    return this.authService.setTwoFactor(user.id, false, dto);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Roles (ACC-06, ACC-07)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Swaps the active role and returns a new token pair. Never re-authenticates:
   * tier and Trust Score belong to the identity, not the role.
   */
  @Post('roles/switch')
  @HttpCode(HttpStatus.OK)
  async switchRole(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(switchRoleSchema)) dto: SwitchRoleDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<SessionTokens> {
    return this.authService.switchRole(user.id, Role[dto.role], userAgent);
  }

  /** Adds a second role (a Worker who also hires, say) and activates it. */
  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  async addRole(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(addRoleSchema)) dto: AddRoleDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<SessionTokens> {
    return this.authService.addRole(user.id, Role[dto.role], userAgent);
  }

  /**
   * A deliberately tiny authenticated probe, used by the web session callback to
   * confirm a token is still good. The full identity graph is the `me` GraphQL
   * query — this is not a second read API.
   */
  @Get('session')
  @HttpCode(HttpStatus.OK)
  session(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}

/** Picks the leading language tag from Accept-Language ("fr-CM,fr;q=0.9" → "fr"). */
function parseLocale(acceptLanguage?: string): string | undefined {
  const tag = acceptLanguage?.split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return tag === 'en' || tag === 'fr' ? tag : undefined;
}
