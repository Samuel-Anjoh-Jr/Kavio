import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { AuthService, SignUpResult } from './auth.service';
import { signUpSchema } from './dto/sign-up.dto';
import type { SignUpDto } from './dto/sign-up.dto';

/**
 * Auth writes (REST, per the DUAL API RULE). Sign-up is a public endpoint, so
 * it is rate-limited well below the global default to blunt automated abuse
 * (SRS §18); the honeypot in the DTO catches the rest.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async signUp(@Body(new ZodValidationPipe(signUpSchema)) dto: SignUpDto): Promise<SignUpResult> {
    return this.authService.signUp(dto);
  }
}
