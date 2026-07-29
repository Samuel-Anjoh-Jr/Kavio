import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@kavio/database';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { AppException } from '../../lib/app-exception';
import { createLogger } from '../../lib/logger';
import { PrismaService } from '../../prisma/prisma.service';
import type { SavedWorkerView } from './models/favorite.model';

const logger = createLogger('profiles:favorites');

/**
 * Saved workers: a client or business's personal shortlist back to a profile
 * (DIS-02's "Save" action). Thin on purpose — no note, no folder, no scoring,
 * no moderation — which is also why both writes are idempotent: a bookmark
 * has no history worth appending to, so a double-tap is just the same fact
 * stated twice, not an error.
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async save(user: AuthenticatedUser, workerId: string): Promise<{ workerId: string }> {
    if (workerId === user.id) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CANNOT_SAVE_SELF',
        'You cannot save your own profile.',
      );
    }

    await this.assertWorkerExists(workerId);

    try {
      await this.prisma.client.favorite.create({
        data: { userId: user.id, workerId },
      });
      logger.info('Worker saved', { payload: { userId: user.id, workerId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Already saved — the toggle already reflects the state the caller
        // wanted, so this is success, not a conflict to report.
      } else {
        throw error;
      }
    }

    return { workerId };
  }

  async remove(user: AuthenticatedUser, workerId: string): Promise<{ workerId: string }> {
    await this.prisma.client.favorite.deleteMany({
      where: { userId: user.id, workerId },
    });
    logger.info('Worker unsaved', { payload: { userId: user.id, workerId } });
    return { workerId };
  }

  /**
   * The signed-in identity's saved workers, newest first — card-shaped so the
   * "Saved" list renders without a second round trip, and so a worker card
   * anywhere else can answer "have I saved this one" from the same query.
   */
  async listMine(userId: string): Promise<SavedWorkerView[]> {
    const rows = await this.prisma.client.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        worker: {
          select: {
            id: true,
            name: true,
            avatar: true,
            tier: true,
            trustScore: true,
            workerProfile: { select: { headline: true, city: true } },
            trustScoreRecord: { select: { completedJobs: true, averageRating: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      userId: row.worker.id,
      name: row.worker.name,
      avatar: row.worker.avatar,
      headline: row.worker.workerProfile?.headline ?? null,
      city: row.worker.workerProfile?.city ?? null,
      tier: row.worker.tier,
      trustScore: row.worker.trustScore,
      completedJobs: row.worker.trustScoreRecord?.completedJobs ?? 0,
      averageRating:
        row.worker.trustScoreRecord?.averageRating == null
          ? null
          : Number(row.worker.trustScoreRecord.averageRating),
      savedAt: row.createdAt,
    }));
  }

  private async assertWorkerExists(workerId: string): Promise<void> {
    const worker = await this.prisma.client.user.findUnique({
      where: { id: workerId },
      select: { id: true },
    });

    if (!worker) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'WORKER_NOT_FOUND',
        'We could not find that profile.',
      );
    }
  }
}
