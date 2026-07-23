import { DisputeFaultParty, DisputeResolution } from '@trustpro/database';
import { z } from 'zod';

/**
 * Dispute writes (PAY-03, ADM-05). REST, per the DUAL API RULE.
 */

/** Opening a dispute freezes the booking's escrow until an admin resolves it. */
export const openDisputeSchema = z.object({
  bookingId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(10, 'Explain the problem in a sentence or two.')
    .max(2000, 'Keep it under 2000 characters.'),
  /** Optional opening message beyond the reason. */
  message: z.string().trim().max(2000).optional(),
  /** Already-uploaded DISPUTE_EVIDENCE assets. Upload happens first. */
  evidenceAssetIds: z.array(z.uuid()).max(6, 'Attach up to 6 files.').optional(),
});
export type OpenDisputeDto = z.infer<typeof openDisputeSchema>;

/** Adding a message (and optional evidence) to an existing dispute. */
export const disputeMessageSchema = z
  .object({
    body: z.string().trim().max(2000).optional(),
    evidenceAssetIds: z.array(z.uuid()).max(6).optional(),
  })
  .refine((v) => (v.body && v.body.length > 0) || (v.evidenceAssetIds?.length ?? 0) > 0, {
    message: 'Write a message or attach a file.',
    path: ['body'],
  });
export type DisputeMessageDto = z.infer<typeof disputeMessageSchema>;

/**
 * An admin resolving a dispute (ADM-05). The action drives the escrow machine,
 * and the fault finding drives the trust consequence.
 *
 * `faultParty` is OPTIONAL: left out, the resolution supplies a sensible default
 * (a refund implies the worker did not deliver; a release implies the client's
 * complaint did not hold up). Set explicitly, it overrides — and NONE is the one
 * that matters most, because only the admin who read the evidence can say a
 * client escalated in good faith and simply did not prevail.
 */
export const resolveDisputeSchema = z.object({
  resolution: z.enum(DisputeResolution),
  note: z.string().trim().max(2000).optional(),
  faultParty: z.enum(DisputeFaultParty).optional(),
});
export type ResolveDisputeDto = z.infer<typeof resolveDisputeSchema>;
