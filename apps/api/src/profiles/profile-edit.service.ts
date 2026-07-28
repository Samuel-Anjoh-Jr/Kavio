import { Injectable } from '@nestjs/common';
import { LocationSource } from '@trustpro/database';
import { ReverseGeocodeService } from '../geo/reverse-geocode.service';
import { MediaAssetKind } from '@trustpro/database';
import type { AuthenticatedUser } from '../auth/auth.types';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import type {
  UpdateBusinessProfileDto,
  UpdateWorkerProfileDto,
} from './dto/profile-management.dto';
import { ProfileOwnershipService } from './profile-ownership.service';

const logger = createLogger('profiles.edit');

/**
 * Owner edits to the profile itself (PROMPT 48; PRO-07).
 *
 * Two fields are conspicuously NOT editable here, and both are deliberate:
 *
 *   BusinessProfile.rccmNumber  it is a VERIFIED claim. Letting an owner change
 *                               it after approval would carry the verified badge
 *                               across to an unchecked number — the cheapest
 *                               possible way to fake a registered company. It
 *                               changes through a new verification submission.
 *
 *   BusinessProfile.verified    a Trust/Admin decision (BIZ-01), never something
 *                               an intake or edit form can grant itself.
 *
 * Location is also absent: it is written through GeoModule's LocationService, so
 * the rule that a human-placed pin always beats an automatic fix cannot be
 * bypassed by a second write path.
 */
@Injectable()
export class ProfileEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: ProfileOwnershipService,
    private readonly reverseGeocode: ReverseGeocodeService,
  ) {}

  /**
   * Turns a dropped pin into a stored place.
   *
   * The quarter and town come from reverse-geocoding, never from the request:
   * clients filter on `area`, so letting a worker type it would let them appear
   * in a neighbourhood they do not work in. A human-placed pin still wins over
   * an auto-detected fix, which is what `source` records.
   */
  private async resolveLocation(input: {
    latitude: number;
    longitude: number;
    source?: LocationSource;
    landmark?: string | null;
  }) {
    const place = await this.reverseGeocode.resolve({
      latitude: input.latitude,
      longitude: input.longitude,
    });

    return {
      latitude: input.latitude,
      longitude: input.longitude,
      locationSource: input.source ?? LocationSource.HUMAN_INPUT,
      geoRegionId: place.regionId,
      landmark: input.landmark ?? null,
      ...(place.city ? { city: place.city } : {}),
      ...(place.locality ? { area: place.locality } : {}),
    };
  }

  /** Explicitly "I would rather not say" — every derived field goes with it. */
  private clearedLocation() {
    return {
      latitude: null,
      longitude: null,
      locationSource: null,
      geoRegionId: null,
      landmark: null,
      city: null,
      area: null,
    };
  }

  async updateWorkerProfile(user: AuthenticatedUser, dto: UpdateWorkerProfileDto) {
    const profile = await this.ownership.requireWorkerProfile(user.id);

    if (dto.coverAssetId) {
      await this.ownership.requireOwnedMedia(
        user.id,
        dto.coverAssetId,
        [MediaAssetKind.WORKER_COVER, MediaAssetKind.PORTFOLIO_IMAGE],
        'coverAssetId',
      );
    }

    // Resolved before the write so a failing geocode never leaves the profile
    // half-updated with coordinates but no place name.
    const locationData =
      dto.location === undefined
        ? {}
        : dto.location === null
          ? this.clearedLocation()
          : await this.resolveLocation(dto.location);

    const updated = await this.prisma.client.workerProfile.update({
      where: { id: profile.id },
      data: {
        ...(dto.headline !== undefined ? { headline: dto.headline } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.yearsExperience !== undefined ? { yearsExperience: dto.yearsExperience } : {}),
        ...(dto.coverAssetId !== undefined ? { coverAssetId: dto.coverAssetId } : {}),
        ...locationData,
      },
      select: {
        id: true,
        headline: true,
        bio: true,
        yearsExperience: true,
        coverAssetId: true,
        city: true,
        area: true,
        landmark: true,
      },
    });

    logger.info('Worker profile updated', {
      payload: { workerProfileId: profile.id, changed: Object.keys(dto) },
    });

    return updated;
  }

  async updateBusinessProfile(user: AuthenticatedUser, dto: UpdateBusinessProfileDto) {
    const profile = await this.ownership.requireBusinessProfile(user.id);

    if (dto.logoAssetId) {
      await this.ownership.requireOwnedMedia(
        user.id,
        dto.logoAssetId,
        [MediaAssetKind.BUSINESS_LOGO],
        'logoAssetId',
      );
    }

    const updated = await this.prisma.client.businessProfile.update({
      where: { id: profile.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.logoAssetId !== undefined ? { logoAssetId: dto.logoAssetId } : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        contactEmail: true,
        contactPhone: true,
        address: true,
        logoAssetId: true,
      },
    });

    logger.info('Business profile updated', {
      payload: { businessProfileId: profile.id, changed: Object.keys(dto) },
    });

    return updated;
  }
}
