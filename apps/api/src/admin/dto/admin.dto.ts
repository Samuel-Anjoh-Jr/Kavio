import {
  AnnouncementAudience,
  AnnouncementStatus,
  Role,
  UserStatus,
  VerificationTier,
} from '@trustpro/database';
import { z } from 'zod';

/**
 * Admin WRITES (REST, per the DUAL API RULE; ADM-02, ADM-06, ADM-07) and the
 * filter shapes the read resolvers validate against.
 *
 * Every list filter is a CLOSED set. An admin console is the one surface where
 * an unbounded `orderBy` or a free-form column name looks harmless and is an
 * injection, so the enums do the refusing before anything reaches SQL.
 */

export const listUsersSchema = z.object({
  /** Matched against name, email and phone. */
  query: z.string().trim().min(1).max(120).optional(),
  role: z.enum(Role).optional(),
  status: z.enum(UserStatus).optional(),
  tier: z.enum(VerificationTier).optional(),
  limit: z.int().min(1).max(50).optional(),
  offset: z.int().min(0).optional(),
});
export type ListUsersDto = z.infer<typeof listUsersSchema>;

export const inviteAgentSchema = z.object({
  name: z.string().trim().min(2, 'Enter their name.').max(120),
  email: z.email('Enter a valid email address.'),
  /** E.164, normalised at capture so SMS can be switched on later unchanged. */
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'Enter the phone number in international format.')
    .optional(),
  note: z.string().trim().max(500).optional(),
});
export type InviteAgentDto = z.infer<typeof inviteAgentSchema>;

/**
 * Redeeming an agent invitation.
 *
 * A password is required even though the invitation link proves possession: the
 * link lives in an inbox, and an agent account that can be taken over by anyone
 * who reads that inbox later is a verification credential left on a doormat.
 */
export const acceptAgentInvitationSchema = z.object({
  token: z.string().trim().min(20, 'That invitation link is not valid.').max(200),
  password: z
    .string()
    .min(10, 'Use at least 10 characters.')
    .max(200, 'Keep it under 200 characters.'),
  /** Optional override of the name the admin typed. */
  name: z.string().trim().min(2).max(120).optional(),
});
export type AcceptAgentInvitationDto = z.infer<typeof acceptAgentInvitationSchema>;

/**
 * An announcement (ADM-07). BOTH languages are required.
 *
 * Not a nicety: the platform is bilingual by requirement, and an optional French
 * body is one that ends up empty, leaving half the users an announcement they
 * cannot read. Refusing at the edge is the only thing that actually holds.
 */
export const createAnnouncementSchema = z.object({
  titleEn: z.string().trim().min(3, 'Give the English title.').max(160),
  titleFr: z.string().trim().min(3, 'Donnez le titre en français.').max(160),
  bodyEn: z.string().trim().min(10, 'Write the English body.').max(4000),
  bodyFr: z.string().trim().min(10, 'Écrivez le texte en français.').max(4000),
  audience: z.enum(AnnouncementAudience).default(AnnouncementAudience.ALL),
  /** ISO date. Omit for an announcement that stays until it is archived. */
  expiresAt: z.iso.datetime().optional(),
});
export type CreateAnnouncementDto = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = createAnnouncementSchema
  .partial()
  .extend({ status: z.enum(AnnouncementStatus).optional() })
  .refine((value) => Object.keys(value).length > 0, { message: 'Change at least one field.' });
export type UpdateAnnouncementDto = z.infer<typeof updateAnnouncementSchema>;

export const listAuditLogSchema = z.object({
  /** Exact action key, e.g. "admin.agent_invitation.created". */
  action: z.string().trim().min(1).max(120).optional(),
  actorId: z.uuid().optional(),
  /** ISO datetimes bounding the search. */
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.int().min(1).max(100).optional(),
  offset: z.int().min(0).optional(),
});
export type ListAuditLogDto = z.infer<typeof listAuditLogSchema>;

/**
 * Writing a platform setting (ADM-07).
 *
 * `value` is unconstrained JSON on purpose — the settings surface grows every
 * release and a typed column per toggle is why settings screens ossify. The
 * SERVICE is what refuses unknown keys: an admin may change the settings that
 * exist, not invent new ones the code never reads.
 */
export const updateSettingSchema = z.object({
  value: z.unknown(),
});
export type UpdateSettingDto = z.infer<typeof updateSettingSchema>;
