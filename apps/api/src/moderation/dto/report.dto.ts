import { z } from 'zod';
import {
  AbuseReportReason,
  AbuseReportStatus,
  ModerationActionType,
  ReportTargetType,
} from '@kavio/database';

/**
 * Reporting & moderation WRITE DTOs (ADM-08). Validated with Zod before the DB,
 * per the engineering standard. Reads are GraphQL and carry no DTO.
 */

/**
 * Files a report against anything the reporter can see.
 *
 * Note what is NOT here: the identity to penalise. The reported party is resolved
 * server-side from the target (ModerationTargetService), because a body field
 * naming the person would let a reporter aim a suspension at anyone they liked.
 * `reportedUserId` is accepted only as a fallback for targets that have no
 * derivable owner (a conversation has two members, not an owner) and is verified
 * to be a real participant before it is used.
 */
export const createReportSchema = z
  .object({
    targetType: z.nativeEnum(ReportTargetType),
    targetId: z.string().uuid(),
    reason: z.nativeEnum(AbuseReportReason),
    details: z.string().trim().max(2000).optional(),
    /** Only consulted when the target itself does not resolve to an owner. */
    reportedUserId: z.string().uuid().optional(),
  })
  .strict();
export type CreateReportDto = z.infer<typeof createReportSchema>;

/**
 * Moves a report group through review without deciding it (ADM-08): picking a
 * case up (REVIEWING) or parking it. The deciding actions are on the action
 * endpoint, so "I am looking at this" and "here is my ruling" stay distinct.
 */
export const reviewReportGroupSchema = z
  .object({
    targetType: z.nativeEnum(ReportTargetType),
    targetId: z.string().uuid(),
    status: z.enum([AbuseReportStatus.REVIEWING, AbuseReportStatus.OPEN]),
    reviewNote: z.string().trim().max(2000).optional(),
  })
  .strict();
export type ReviewReportGroupDto = z.infer<typeof reviewReportGroupSchema>;

/**
 * The admin's decision about a reported item and the party behind it (ADM-08).
 *
 * One call settles the whole group: every open report about that target is closed
 * with the same action id, which is what makes twelve complaints about one photo
 * one case rather than twelve.
 */
export const moderationActionSchema = z
  .object({
    action: z.nativeEnum(ModerationActionType),
    /** The item this decision is about. Omitted for a pure account action. */
    targetType: z.nativeEnum(ReportTargetType).optional(),
    targetId: z.string().uuid().optional(),
    /**
     * The party to action. Optional when a target is given (it is derived from
     * the target); required otherwise, since there would be nothing to derive it
     * from.
     */
    subjectUserId: z.string().uuid().optional(),
    /** Shown to the actioned party — a penalty they cannot read is not due process. */
    reason: z.string().trim().min(3).max(1000),
    /** Admin-only working note, never surfaced to the party. */
    internalNote: z.string().trim().max(2000).optional(),
    /**
     * How long a SUSPEND lasts. Ignored by every other action. Bounded at two
     * years — a longer "suspension" is a ban and should be recorded as one.
     */
    suspendDays: z.number().int().min(1).max(730).optional(),
  })
  .strict()
  .refine((value) => value.subjectUserId !== undefined || value.targetId !== undefined, {
    message: 'Provide a target or a subject to act on.',
    path: ['subjectUserId'],
  })
  .refine((value) => (value.targetId === undefined) === (value.targetType === undefined), {
    message: 'A target needs both its type and its id.',
    path: ['targetType'],
  })
  .refine(
    (value) => value.action !== ModerationActionType.SUSPEND || value.suspendDays !== undefined,
    { message: 'A suspension needs a duration.', path: ['suspendDays'] },
  );
export type ModerationActionDto = z.infer<typeof moderationActionSchema>;
