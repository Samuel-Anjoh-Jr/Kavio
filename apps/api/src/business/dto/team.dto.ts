import { TeamMemberAccessLevel, TeamMemberRole } from '@kavio/database';
import { z } from 'zod';

/**
 * Team writes (BIZ-03). REST, per the DUAL API RULE.
 *
 * `role` and `accessLevel` are separate fields on purpose, and both are required
 * on an invitation. `role` is the HR label (admin, HR manager, accountant,
 * staff); `accessLevel` is what the server enforces. Deriving one from the other
 * would look tidy and would mean that renaming somebody's job title silently
 * changed what they can spend.
 */

const contact = {
  email: z.email('Enter a valid email address.').optional(),
  /** E.164, normalised at capture so SMS can be switched on later unchanged. */
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'Enter the phone number in international format.')
    .optional(),
};

export const inviteTeamMemberSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter their name.').max(120),
    ...contact,
    title: z.string().trim().max(120).optional(),
    role: z.enum(TeamMemberRole),
    accessLevel: z.enum(TeamMemberAccessLevel),
  })
  // An invitation with no way to reach the invitee is a row that can never
  // become a member, so it is refused at the edge rather than created and left.
  .refine((v) => Boolean(v.email ?? v.phone), {
    message: 'Give an email address or a phone number so we can send the invitation.',
    path: ['email'],
  });
export type InviteTeamMemberDto = z.infer<typeof inviteTeamMemberSchema>;

export const updateTeamMemberSchema = z
  .object({
    role: z.enum(TeamMemberRole).optional(),
    accessLevel: z.enum(TeamMemberAccessLevel).optional(),
    title: z.string().trim().max(120).nullable().optional(),
  })
  .refine((v) => v.role !== undefined || v.accessLevel !== undefined || v.title !== undefined, {
    message: 'Change at least one field.',
  });
export type UpdateTeamMemberDto = z.infer<typeof updateTeamMemberSchema>;

/** Accepting or declining an invitation by its one-time token. */
export const invitationTokenSchema = z.object({
  token: z.string().trim().min(20, 'That invitation link is not valid.').max(200),
});
export type InvitationTokenDto = z.infer<typeof invitationTokenSchema>;
