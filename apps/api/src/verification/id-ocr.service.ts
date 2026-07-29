import { Injectable } from '@nestjs/common';
import { VerificationRejectionReason } from '@kavio/database';
import { createLogger } from '../lib/logger';

const logger = createLogger('verification:ocr');

/** What an automated read of an identity document concluded. */
export type OcrOutcome =
  /** Text read cleanly. The submission proceeds to human review. */
  | { readonly verdict: 'READABLE'; readonly confidence: number }
  /**
   * Could not be read. This is the TRU-07 case: the subject is told, kindly and
   * actionably, to try again — no reviewer time is spent on a photo nobody can
   * see, and no judgement is implied about the person.
   */
  | {
      readonly verdict: 'UNREADABLE';
      readonly confidence: number;
      readonly reason: VerificationRejectionReason;
    }
  /** No automated opinion available. Goes to a human, exactly as before. */
  | { readonly verdict: 'INCONCLUSIVE' };

/**
 * Automated ID reading (TRU-07).
 *
 * DELIBERATELY A STUB, and feature-flagged OFF, for the same reason SMS is: OCR
 * is a paid API that has not been bought. What matters now is that the SEAM
 * exists and the failure path is built — the friendly retry, the attempt
 * counter, the reviewer never seeing an unreadable photo — because that is the
 * product behaviour, and swapping a provider in later must not require anyone to
 * re-derive it.
 *
 * While disabled this returns INCONCLUSIVE and every submission goes to a human,
 * which is exactly the launch behaviour we want.
 */
@Injectable()
export class IdOcrService {
  private readonly enabled = process.env.VERIFICATION_OCR_ENABLED === 'true';

  /**
   * The confidence below which a document is treated as unreadable. Tunable
   * because the right threshold depends on the provider, and a literal buried in
   * a comparison is not something anyone can tune.
   */
  private readonly minConfidence = Number(process.env.VERIFICATION_OCR_MIN_CONFIDENCE ?? 0.6);

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Reads an identity document.
   *
   * Returns a Promise without being `async`, because there is nothing to await
   * yet — the signature is the seam a real provider call will occupy, and every
   * caller already treats it as asynchronous.
   *
   * @param documentIds the assets submitted for this check, for provider lookup
   */
  inspect(documentIds: readonly string[]): Promise<OcrOutcome> {
    if (!this.enabled || documentIds.length === 0) {
      logger.info('Automated ID reading skipped', {
        result: { enabled: this.enabled, documentCount: documentIds.length },
      });
      return Promise.resolve({ verdict: 'INCONCLUSIVE' });
    }

    // A provider call goes here. Until one is bought, an enabled flag means
    // "pretend everything reads cleanly" — never "reject", because a stub that
    // can refuse a real person's ID is worse than no stub at all.
    const confidence = 1;

    if (confidence < this.minConfidence) {
      return Promise.resolve({
        verdict: 'UNREADABLE',
        confidence,
        reason: VerificationRejectionReason.OCR_UNREADABLE,
      });
    }

    return Promise.resolve({ verdict: 'READABLE', confidence });
  }
}
