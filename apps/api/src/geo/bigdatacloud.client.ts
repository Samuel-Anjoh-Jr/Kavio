import { Injectable } from '@nestjs/common';
import { describeError } from '../lib/describe-error';
import { createLogger } from '../lib/logger';
import type { Coordinates } from './coordinates.util';
import { getBigDataCloudConfig, type BigDataCloudConfig } from './geo.config';

const logger = createLogger('geo.bigdatacloud');

/** What we take from BigDataCloud. Everything else in its response is ignored. */
export interface AdministrativeArea {
  countryCode: string | null;
  countryName: string | null;
  /** Province/region — "Littoral", "Centre". */
  principalSubdivision: string | null;
  /** The most local named thing it knows: city, quarter, locality. */
  locality: string | null;
  city: string | null;
}

interface BdcAdminLevel {
  name?: string;
  description?: string;
  order?: number;
  adminLevel?: number;
}

interface BdcResponse {
  countryCode?: string;
  countryName?: string;
  principalSubdivision?: string;
  locality?: string;
  city?: string;
  localityInfo?: { administrative?: BdcAdminLevel[] };
}

/**
 * Server-side reverse geocoding via BigDataCloud (SRS §12, DIS-09).
 *
 * SERVER-side deliberately: doing this from the browser would put an API key in
 * a bundle and send every user's raw coordinates to a third party from their own
 * IP. Here it is one call from one host, and the coordinates that leave us are
 * whatever the caller sent — never joined to an identity.
 *
 * This client answers "what is this place CALLED". It never decides which
 * GeoRegion a point belongs to: that is PostGIS's job (`geo.region_at_point`),
 * because our boundaries are what the rest of the platform filters on.
 */
@Injectable()
export class BigDataCloudClient {
  private readonly config: BigDataCloudConfig = getBigDataCloudConfig();

  /** True when a key is present. The free tier works without one, more slowly. */
  get hasApiKey(): boolean {
    return this.config.apiKey.length > 0;
  }

  /**
   * Resolves coordinates to an administrative area, or null.
   *
   * Never throws. A reverse-geocode is an ENRICHMENT: if the provider is down,
   * slow, or rate-limiting us, the caller falls back to PostGIS and the user
   * still gets a usable location. Turning a third-party outage into a failed
   * "set my location" tap would be choosing the worse failure.
   */
  async reverseGeocode(
    coordinates: Coordinates,
    locale: 'en' | 'fr',
  ): Promise<AdministrativeArea | null> {
    const started = Date.now();
    const url = new URL(`${this.config.baseUrl}/reverse-geocode-client`);
    url.searchParams.set('latitude', String(coordinates.latitude));
    url.searchParams.set('longitude', String(coordinates.longitude));
    url.searchParams.set('localityLanguage', locale);
    if (this.config.apiKey) {
      url.searchParams.set('key', this.config.apiKey);
    }

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.config.timeoutMs),
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        logger.warn('BigDataCloud returned a non-OK status', {
          payload: { status: response.status },
          durationMs: Date.now() - started,
        });
        return null;
      }

      const body = (await response.json()) as BdcResponse;
      const area = this.toAdministrativeArea(body);

      logger.info('Reverse geocode resolved', {
        durationMs: Date.now() - started,
        // Coordinates are NOT logged: a log line pinning a named person to a
        // doorstep is exactly the record we should not be keeping.
        result: { countryCode: area.countryCode, locality: area.locality },
      });

      return area;
    } catch (error) {
      // warn, not error: the logger keeps stack traces out of warn, and a slow
      // third party is a degradation we recover from — not an incident. The
      // message alone is what a reader needs (timeout vs DNS vs 429).
      logger.warn('BigDataCloud lookup failed — falling back to PostGIS', {
        payload: { reason: describeError(error) },
        durationMs: Date.now() - started,
      });
      return null;
    }
  }

  private toAdministrativeArea(body: BdcResponse): AdministrativeArea {
    // BigDataCloud's flat `locality` is often the commune rather than the
    // quarter. The administrative ladder in `localityInfo` is finer-grained, so
    // the deepest entry there wins when it is more specific than the flat field.
    const ladder = body.localityInfo?.administrative ?? [];
    const deepest = ladder.reduce<BdcAdminLevel | undefined>(
      (best, level) => ((level.adminLevel ?? -1) > (best?.adminLevel ?? -1) ? level : best),
      undefined,
    );

    return {
      countryCode: body.countryCode ?? null,
      countryName: body.countryName ?? null,
      principalSubdivision: body.principalSubdivision ?? null,
      locality: deepest?.name ?? body.locality ?? body.city ?? null,
      city: body.city ?? null,
    };
  }
}
