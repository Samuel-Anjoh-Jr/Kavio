import { HttpStatus, Injectable } from '@nestjs/common';
import type { MediaAssetKind } from '@kavio/database';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';

const logger = createLogger('profiles.ownership');

/**
 * Ownership resolution for every owner-edit flow (PROMPT 48; PRO-07).
 *
 * ONE rule, enforced in one place: the profile being edited is ALWAYS derived
 * from the authenticated token, never from a request body or a path parameter.
 * There is deliberately no `workerProfileId` argument anywhere in the write
 * surface — an endpoint that accepts one is an endpoint that can be pointed at
 * somebody else's profile the moment a guard is misconfigured, and "the caller
 * cannot even express the attack" is a stronger property than "the guard
 * catches it".
 *
 * Media is checked the same way: an asset id in a body is attacker-controlled
 * until proven otherwise, so it is verified to belong to the caller AND to be a
 * kind that may appear where it is being attached.
 */
@Injectable()
export class ProfileOwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  /** The caller's own worker profile, or a clear 404 telling them to finish onboarding. */
  async requireWorkerProfile(userId: string): Promise<{ id: string; userId: string }> {
    const profile = await this.prisma.client.workerProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });

    if (!profile) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'WORKER_PROFILE_NOT_FOUND',
        'Finish setting up your worker profile first.',
      );
    }

    return profile;
  }

  async requireBusinessProfile(ownerId: string): Promise<{ id: string; ownerId: string }> {
    const profile = await this.prisma.client.businessProfile.findUnique({
      where: { ownerId },
      select: { id: true, ownerId: true },
    });

    if (!profile) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'BUSINESS_PROFILE_NOT_FOUND',
        'Finish setting up your company profile first.',
      );
    }

    return profile;
  }

  /**
   * Verifies that a media asset is the caller's and is an allowed kind.
   *
   * The kind check is not paperwork. Without it, a worker could attach their own
   * uploaded NATIONAL_ID_FRONT as a portfolio photo — the ownership test passes,
   * the asset is theirs — and a PRIVATE identity document would be rendered on a
   * PUBLIC profile. The failure would be self-inflicted, which makes it no less
   * of a KYC leak (NFR-SEC-04).
   */
  async requireOwnedMedia(
    userId: string,
    mediaAssetId: string,
    allowedKinds: readonly MediaAssetKind[],
    field = 'mediaAssetId',
  ): Promise<{ id: string; kind: MediaAssetKind }> {
    const asset = await this.prisma.client.mediaAsset.findUnique({
      where: { id: mediaAssetId },
      select: { id: true, kind: true, ownerId: true, deletedAt: true },
    });

    // Someone else's asset gets the same "not found" as a nonexistent one: a
    // distinct "forbidden" would confirm the id is real, turning this endpoint
    // into an oracle for enumerating other people's uploads.
    if (!asset || asset.ownerId !== userId || asset.deletedAt) {
      if (asset && asset.ownerId !== userId) {
        logger.warn('Media asset referenced by a non-owner', {
          payload: { mediaAssetId, callerId: userId },
        });
      }

      throw new AppException(
        HttpStatus.NOT_FOUND,
        'MEDIA_NOT_FOUND',
        'That upload was not found.',
        {
          [field]: ['Upload the file again.'],
        },
      );
    }

    if (!allowedKinds.includes(asset.kind)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'MEDIA_WRONG_KIND',
        'That file cannot be used here.',
        { [field]: [`Upload it as one of: ${allowedKinds.join(', ')}.`] },
      );
    }

    return { id: asset.id, kind: asset.kind };
  }
}
