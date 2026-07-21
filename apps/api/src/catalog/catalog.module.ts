import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CatalogController } from './catalog.controller';
import { CatalogResolver } from './catalog.resolver';
import { CatalogService } from './catalog.service';

/**
 * The service-category taxonomy (PROMPT 43; ADM-02, DIS-05).
 *
 * Registered ahead of SearchModule and ProfilesModule, both of which are scoped
 * to this list — search matches within it, and a worker files their services
 * under it. Exported because profile management needs to validate that a
 * category a worker picked is real and live before attaching a service to it.
 */
@Module({
  imports: [PrismaModule],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogResolver],
  exports: [CatalogService],
})
export class CatalogModule {}
