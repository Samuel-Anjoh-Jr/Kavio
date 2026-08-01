import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { getPlatformFeeBps } from '../payments/payments.config';

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
   * SMS is a paid aggregator Kavio has not bought yet, so EMAIL is the
   * launch default: it is the channel that actually delivers today. An operator
   * flips this to PHONE (or EITHER) the day SMS goes live, with no code change.
   */
  contactChannel: 'verification.contactChannel',
  /** Flat charge to publish a job, in whole XAF. 0 means posting is free. */
  jobPostingFeeXaf: 'jobs.postingFeeXaf',
  /**
   * Platform escrow fee, stored as a PERCENTAGE (e.g. 10 for 10%) because that
   * is what the admin console's settings form shows an operator — the same
   * registry key ('platform.feePercent') has always accepted this shape, this
   * is simply the first code path that reads it back.
   */
  platformFeePercent: 'platform.feePercent',
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
   * The platform escrow fee, in basis points (PAY-01, SRS §15.1 "~10%, admin
   * configurable"). Reads the admin-set percentage and converts to bps; an
   * operator who has never touched the setting — or entered something out of
   * range — gets the env-configured `PLATFORM_FEE_BPS` default rather than a
   * broken booking, same "typo in a settings row must not take down signup"
   * rule as `contactChannel` above.
   */
  async platformFeeBps(): Promise<number> {
    const value = await this.read(SETTING_KEYS.platformFeePercent);
    // `Number(null)` is 0, a value that then reads as a perfectly valid "admin
    // set the fee to 0%" — so the missing-row case has to be ruled out before
    // the numeric coercion, not after, or an operator who never touched this
    // setting gets a silent 0% fee instead of the documented ~10% default.
    if (value === null || value === undefined) {
      return getPlatformFeeBps();
    }
    const percent = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return getPlatformFeeBps();
    }
    return Math.round(percent * 100);
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
