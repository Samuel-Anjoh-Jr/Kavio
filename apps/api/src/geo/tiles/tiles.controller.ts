import { Controller, Get, Header, HttpStatus, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../auth/decorators/auth.decorators';
import { AppException } from '../../lib/app-exception';
import { TILE_CACHE_TTL_SECONDS } from '../geo.config';
import { isTileLayer, parseTileCoordinates } from './tile.util';
import { TilesService, type TileJson } from './tiles.service';

/**
 * Vector tiles for map rendering (PROMPT 41, SRS §12).
 *
 * REST rather than GraphQL because a tile is binary protobuf fetched by Mapbox
 * GL's own loader — see TilesService for the full reasoning. This is the only
 * read in the codebase that is allowed off GraphQL, and it is documented in
 * both places so it stays a considered exception rather than a precedent.
 *
 * @Public() because the map renders in the guest first-interface. What that
 * exposes is bounded by the layers themselves: `worker_density` emits grid-cell
 * counts and never an individual worker or position, so a public tile cannot be
 * scraped into a list of where people live.
 */
@Controller('tiles')
export class TilesController {
  constructor(private readonly tiles: TilesService) {}

  /**
   * TileJSON descriptor. Mapbox GL loads this first and follows `tiles[]` to
   * either CARTO or back here, depending on configuration.
   */
  @Public()
  @Get(':layer.json')
  tileJson(@Param('layer') layer: string, @Req() request: Request): TileJson {
    this.assertLayer(layer);
    const base = `${request.protocol}://${request.get('host')}`;
    return this.tiles.tileJson(layer, base);
  }

  /**
   * One MVT tile.
   *
   * Written through the raw response because Nest's default JSON serialiser
   * would mangle a Buffer into `{"type":"Buffer","data":[…]}` — valid JSON, and
   * completely useless to a map.
   */
  @Public()
  @Get(':layer/:z/:x/:y.mvt')
  @Header('Content-Type', 'application/vnd.mapbox-vector-tile')
  async tile(
    @Param('layer') layer: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @Res() response: Response,
  ): Promise<void> {
    this.assertLayer(layer);
    const coordinates = parseTileCoordinates(z, x, y);
    const tile = await this.tiles.renderTile(layer, coordinates);

    // Tiles are public and identical for every viewer, so they are safe to hold
    // in shared caches and CDNs. `stale-while-revalidate` matters most on the
    // phones this is built for: a slightly stale tile now beats a fresh one
    // after a 3G round-trip.
    response.setHeader(
      'Cache-Control',
      `public, max-age=${TILE_CACHE_TTL_SECONDS}, stale-while-revalidate=${TILE_CACHE_TTL_SECONDS * 2}`,
    );

    // 204 for an empty tile: it is a correct answer ("nothing here"), and
    // Mapbox treats it as an empty tile rather than a failure to retry.
    if (tile.length === 0) {
      response.status(HttpStatus.NO_CONTENT).end();
      return;
    }

    response.status(HttpStatus.OK).send(tile);
  }

  private assertLayer(layer: string): asserts layer is 'worker_density' | 'regions' {
    if (!isTileLayer(layer)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'UNKNOWN_TILE_LAYER',
        'That map layer does not exist.',
        { layer: ['Expected one of: worker_density, regions.'] },
      );
    }
  }
}
