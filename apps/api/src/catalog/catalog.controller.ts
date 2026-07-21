import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import { CatalogService, type CategoryRow } from './catalog.service';
import {
  createServiceCategorySchema,
  reorderServiceCategoriesSchema,
  updateServiceCategorySchema,
  type CreateServiceCategoryDto,
  type ReorderServiceCategoriesDto,
  type UpdateServiceCategoryDto,
} from './dto/catalog.dto';

/**
 * Taxonomy WRITES (REST, per the DUAL API RULE). Every read is on the GraphQL
 * resolver, including the admin console's own list.
 *
 * Gated on `admin:settings_manage` rather than on the ADMIN role name: the
 * catalogue is platform configuration, and stating the capability means granting
 * a future Ops role this one power is a change in the permission table alone
 * (ADM-02, NFR-SEC-02).
 *
 * There is NO delete endpoint, and that is a design decision rather than an
 * omission — see CatalogService.retire.
 */
@Controller('admin/service-categories')
@RequirePermissions('admin:settings_manage')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createServiceCategorySchema)) dto: CreateServiceCategoryDto,
  ): Promise<CategoryRow> {
    return this.catalog.create(dto, actor);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateServiceCategorySchema)) dto: UpdateServiceCategoryDto,
  ): Promise<CategoryRow> {
    return this.catalog.update(id, dto, actor);
  }

  /**
   * Retires a category and its specialisations (ADM-02).
   *
   * A POST to a named sub-resource rather than DELETE, because it is not a
   * deletion: the row survives so historic jobs and services still resolve, and
   * an HTTP verb that says "destroy this" would be a lie about what happens.
   */
  @Post(':id/retire')
  @HttpCode(HttpStatus.OK)
  async retire(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CategoryRow> {
    return this.catalog.retire(id, actor);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  async restore(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CategoryRow> {
    return this.catalog.restore(id, actor);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  async reorder(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(reorderServiceCategoriesSchema)) dto: ReorderServiceCategoriesDto,
  ): Promise<{ reordered: number }> {
    return { reordered: await this.catalog.reorder(dto, actor) };
  }

  /**
   * Recomputes `workerCount` for the whole taxonomy.
   *
   * Exposed as an admin action because the count is derived, not incremental: if
   * it ever looks wrong, the fix is to re-derive it rather than to hunt for the
   * write path that missed an increment.
   */
  @Post('recount')
  @HttpCode(HttpStatus.OK)
  async recount(@CurrentUser() actor: AuthenticatedUser): Promise<{ changed: number }> {
    return { changed: await this.catalog.recountWorkers(actor) };
  }
}
