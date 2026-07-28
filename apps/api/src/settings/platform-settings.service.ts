import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';

const logger = createLogger('settings');

/**
 * Runtime reader for admin-tunable platform settings (ADM-07).
 *
 * The admin console has always been able to WRITE `SystemSetting`, but nothing
 * read it back — so every "setting" was decoration and the behaviour it claimed
 * to control was still a literal somewhere. This is the other half: the one
 * place feature code asks what an operator has configured.
 *
 * Values are cached in memory for a few seconds rather than read per request.
 * A settings row changes perhaps monthly, is read on nearly every search and
 * every job publish, and is small enough that the whole table fits in one
 * object. The cache is also invalidated the moment an admin saves, so the
 * TTL only covers the case of a second API instance that did not see the event.
 */
const CACHE_TTL_MS = 10_000;

/** Which contact channel a new account must verify before it counts (ACC-04). */
export type ContactChannelRequirement = 'PHONE' | 'EMAIL' | 'EITHER';

export const SETTING_KEYS = {
  /**
   * SMS is a paid aggregator TrustPro has not bought yet, so EMAIL is the
   * launch default: it is the channel that actually delivers today. An operator
   * flips this to PHONE (or EITHER) the day SMS goes live, with no code change.
   */
  contactChannel: 'verification.contactChannel',
  /** Flat charge to publish a job, in whole XAF. 0 means posting is free. */
  jobPostingFeeXaf: 'jobs.postingFeeXaf',
} as const;

interface CacheEntry {
  value: unknown;
  readAt: number;
}

@Injectable()
export class PlatformSettingsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads one setting, falling back to the code default when an operator has
   * never overridden it. A missing row is the ordinary state, not an error —
   * the registry lists what exists, the table holds only what was changed.
   */
  private async read(key: string): Promise<unknown> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.readAt < CACHE_TTL_MS) {
      return cached.value;
    }

    const row = await this.prisma.client.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    });

    const value = row?.value ?? null;
    this.cache.set(key, { value, readAt: Date.now() });
    return value;
  }

  /**
   * Which channel a worker must verify before their profile may be shown.
   * An unrecognised stored value falls back to the default rather than throwing:
   * a typo in one settings row must not take down signup.
   */
  async contactChannel(): Promise<ContactChannelRequirement> {
    const value = await this.read(SETTING_KEYS.contactChannel);
    if (value === 'PHONE' || value === 'EMAIL' || value === 'EITHER') {
      return value;
    }
    return 'EMAIL';
  }

  /** Flat job-posting fee in whole XAF. Never negative, never fractional. */
  async jobPostingFeeXaf(): Promise<number> {
    const value = await this.read(SETTING_KEYS.jobPostingFeeXaf);
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.floor(parsed);
  }

  /**
   * Drops the cached value as soon as an admin saves, so the console's "saved"
   * and the platform's behaviour never disagree for the length of a TTL.
   */
  @OnEvent('admin.setting.updated')
  onSettingUpdated(payload: { key?: string }): void {
    if (payload?.key) {
      this.cache.delete(payload.key);
      logger.info('Setting cache invalidated', { result: { key: payload.key } });
    } else {
      this.cache.clear();
    }
  }
}
