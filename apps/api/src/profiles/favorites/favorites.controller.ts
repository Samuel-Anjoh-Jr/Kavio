import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../../lib/zod-validation.pipe';
import { saveFavoriteSchema, type SaveFavoriteDto } from './dto/favorite.dto';
import { FavoritesService } from './favorites.service';

/**
 * Saved-worker writes (REST, per the DUAL API RULE). Reads are GraphQL
 * (`myFavorites` on FavoritesResolver).
 *
 * `favorite:save` is granted to every signed-in role (COMMON in the RBAC
 * catalogue) — bookmarking a profile is not a role-specific capability the
 * way posting a job or sending a quote is.
 */
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('favorite:save')
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(saveFavoriteSchema)) dto: SaveFavoriteDto,
  ) {
    return this.favorites.save(user, dto.workerId);
  }

  @Delete(':workerId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('favorite:save')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workerId', new ParseUUIDPipe()) workerId: string,
  ) {
    return this.favorites.remove(user, workerId);
  }
}
