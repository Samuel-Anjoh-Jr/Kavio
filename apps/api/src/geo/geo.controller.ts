import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { setLocationSchema, type SetLocationDto } from './dto/location.dto';
import { LocationService, type SetLocationResult } from './location.service';

/**
 * Location WRITES (REST, per the DUAL API RULE). Every spatial read is on the
 * GraphQL resolver.
 *
 * Authenticated by default via the global JwtAuthGuard — a guest can look
 * around the map freely, but storing a location against a profile is an act on
 * an account. The profile written is the one belonging to the ACTIVE role, read
 * from the token; the body cannot name a target.
 */
@Controller('geo')
export class GeoController {
  constructor(private readonly location: LocationService) {}

  /**
   * Sets the caller's location for their active role (DIS-09).
   *
   * Returns `applied: false` — with 200, not an error — when an automatic fix
   * was refused because the user has a hand-placed pin on file. That is a
   * successful, correct outcome that the UI should surface as an offer ("update
   * your saved location?"), so it must not arrive as an exception.
   */
  @Post('location')
  @HttpCode(HttpStatus.OK)
  async setLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(setLocationSchema)) dto: SetLocationDto,
  ): Promise<SetLocationResult> {
    return this.location.setLocation(user, dto);
  }
}
