import { HttpStatus, Injectable } from '@nestjs/common';
import { LocationSource, Role } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { assertValidCoordinates, type Coordinates } from './coordinates.util';
import { ReverseGeocodeService, type ResolvedPlace } from './reverse-geocode.service';

const logger = createLogger('geo.location');

export interface SetLocationInput extends Partial<Coordinates> {
  source: LocationSource;
  /** The human's own words about where this is. Stored verbatim. */
  landmark?: string | null;
  /** Explicit consent to replace a pin the user placed by hand. */
  overrideHumanPin?: boolean;
  locale?: string;
}

export interface SetLocationResult {
  latitude: number;
  longitude: number;
  source: LocationSource;
  landmark: string | null;
  place: ResolvedPlace;
  /** False when an automatic fix was refused because a human pin is on file. */
  applied: boolean;
}

/**
 * The columns a location write touches. Identical across all three profile
 * models, which is what lets one code path serve every role — and stops the
 * human-pin rule from being implemented three times and enforced twice.
 */
interface LocationUpdate {
  latitude: number;
  longitude: number;
  locationSource: LocationSource;
  locationUpdatedAt: Date;
  geoRegionId: string | null;
  landmark?: string | null;
  city?: string;
  area?: string;
}

/** Which profile table the active role writes its location to. */
const PROFILE_BY_ROLE: Partial<
  Record<Role, 'workerProfile' | 'clientProfile' | 'businessProfile'>
> = {
  [Role.WORKER]: 'workerProfile',
  [Role.CLIENT]: 'clientProfile',
  [Role.BUSINESS]: 'businessProfile',
};

/**
 * Storing where somebody is (PROMPT 39, DIS-09, SRS §12).
 *
 * ── The rule this service exists to enforce ─────────────────────────────────
 * A HUMAN PIN ALWAYS BEATS A MACHINE FIX.
 *
 * In Douala and Yaoundé, GPS is routinely tens or hundreds of metres out, and
 * street addressing is thin enough that people navigate by landmark. When a
 * worker has taken the trouble to drag a pin onto their actual workshop, a
 * later background GPS reading must not quietly move them off it — that would
 * turn a deliberate correction into a recurring bug the user cannot win.
 *
 * So an automatic source (DEVICE_GPS, REVERSE_GEOCODE) will not overwrite a
 * position whose source is HUMAN_INPUT. The write is refused, reported as
 * `applied: false`, and the caller may retry with `overrideHumanPin` — which is
 * how the UI offers "update my saved location?" as a choice rather than an
 * ambush.
 */
@Injectable()
export class LocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reverseGeocode: ReverseGeocodeService,
  ) {}

  async setLocation(user: AuthenticatedUser, input: SetLocationInput): Promise<SetLocationResult> {
    const coordinates = assertValidCoordinates(input);
    const model = PROFILE_BY_ROLE[user.activeRole];

    if (!model) {
      // Agents and admins have no profile of their own to place on the map.
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'ROLE_HAS_NO_LOCATION',
        'Switch to your Worker, Client or Business role to set a location.',
      );
    }

    const ownerField = model === 'businessProfile' ? 'ownerId' : 'userId';

    const existing = await this.findProfile(model, ownerField, user.id);

    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PROFILE_NOT_FOUND',
        'Finish setting up your profile before setting a location.',
      );
    }

    const isAutomatic = input.source !== LocationSource.HUMAN_INPUT;
    // A HUMAN_INPUT source with no coordinates on file is not a pin worth
    // protecting — it is a half-finished write. Requiring both means the guard
    // can never lock a profile out of ever recording a position.
    const humanPinOnFile =
      existing.locationSource === LocationSource.HUMAN_INPUT &&
      existing.latitude !== null &&
      existing.longitude !== null;

    if (isAutomatic && humanPinOnFile && !input.overrideHumanPin) {
      logger.info('Automatic location refused — human pin on file', {
        payload: { userId: user.id, role: user.activeRole, source: input.source },
      });

      const place = await this.reverseGeocode.resolve(
        { latitude: existing.latitude as number, longitude: existing.longitude as number },
        input.locale,
      );

      return {
        latitude: existing.latitude as number,
        longitude: existing.longitude as number,
        source: LocationSource.HUMAN_INPUT,
        landmark: existing.landmark,
        place,
        applied: false,
      };
    }

    const place = await this.reverseGeocode.resolve(coordinates, input.locale);

    // `location` (the GIST-indexed geography) is NOT written here: the
    // trustpro_sync_location trigger derives it from these two floats on the
    // same statement, so there is exactly one writable source of truth.
    await this.updateProfile(model, existing.id, {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      locationSource: input.source,
      locationUpdatedAt: new Date(),
      geoRegionId: place.regionId,
      // An empty landmark clears the old one; an absent one leaves it alone.
      // "I deleted my note" and "I did not mention my note" are different acts.
      ...(input.landmark !== undefined ? { landmark: input.landmark || null } : {}),
      ...(place.city ? { city: place.city } : {}),
      ...(place.locality ? { area: place.locality } : {}),
    });

    logger.info('Location updated', {
      payload: {
        userId: user.id,
        role: user.activeRole,
        source: input.source,
        regionSlug: place.regionSlug,
      },
    });

    return {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      source: input.source,
      landmark: input.landmark !== undefined ? input.landmark || null : existing.landmark,
      place,
      applied: true,
    };
  }

  private async findProfile(
    model: 'workerProfile' | 'clientProfile' | 'businessProfile',
    ownerField: 'userId' | 'ownerId',
    userId: string,
  ) {
    const select = {
      id: true,
      latitude: true,
      longitude: true,
      locationSource: true,
      landmark: true,
    } as const;

    if (model === 'workerProfile') {
      return this.prisma.client.workerProfile.findUnique({ where: { userId }, select });
    }
    if (model === 'clientProfile') {
      return this.prisma.client.clientProfile.findUnique({ where: { userId }, select });
    }
    return this.prisma.client.businessProfile.findUnique({ where: { ownerId: userId }, select });
  }

  private async updateProfile(
    model: 'workerProfile' | 'clientProfile' | 'businessProfile',
    id: string,
    data: LocationUpdate,
  ): Promise<void> {
    if (model === 'workerProfile') {
      await this.prisma.client.workerProfile.update({ where: { id }, data });
      return;
    }
    if (model === 'clientProfile') {
      await this.prisma.client.clientProfile.update({ where: { id }, data });
      return;
    }
    await this.prisma.client.businessProfile.update({ where: { id }, data });
  }
}
