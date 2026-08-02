import { TeamMemberAccessLevel, TeamMemberRole } from '@kavio/database';
import { z } from 'zod';
import { passwordSchema } from '../../auth/dto/auth.dto';

/**
 * Team writes (BIZ-03). REST, per the DUAL API RULE.
 *
 * `roles` and `accessLevel` are separate fields on purpose, and both are required
 * on an invitation. `roles` are HR labels (a seat can hold more than one — an
 * office manager who is also the accountant is one member, two labels);
 * `accessLevel` is what the server enforces. Deriving one from the other would
 * look tidy and would mean that renaming somebody's job title silently changed
 * what they can spend.
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

const rolesSchema = z
  .array(z.enum(TeamMemberRole))
  .min(1, 'Choose at least one role.')
  // A seat holds each label at most once — a repeated value is a client bug,
  // not a second grant of the same thing.
  .refine((roles) => new Set(roles).size === roles.length, {
    message: 'Each role can only be chosen once.',
  });

export const inviteTeamMemberSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter their name.').max(120),
    ...contact,
    title: z.string().trim().max(120).optional(),
    roles: rolesSchema,
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
    roles: rolesSchema.optional(),
    accessLevel: z.enum(TeamMemberAccessLevel).optional(),
    title: z.string().trim().max(120).nullable().optional(),
  })
  .refine((v) => v.roles !== undefined || v.accessLevel !== undefined || v.title !== undefined, {
    message: 'Change at least one field.',
  });
export type UpdateTeamMemberDto = z.infer<typeof updateTeamMemberSchema>;

/** Accepting or declining an invitation by its one-time token. */
export const invitationTokenSchema = z.object({
  token: z.string().trim().min(20, 'That invitation link is not valid.').max(200),
});
export type InvitationTokenDto = z.infer<typeof invitationTokenSchema>;

/**
 * Redeeming a team invitation by email, for an invitee with no Kavio account yet.
 *
 * A password is required even though the link proves possession of the inbox:
 * the link can sit in that inbox indefinitely, and a business seat that anyone
 * who later reads the mail can claim is a credential left on a doormat — the
 * same reasoning as agent invitations (acceptAgentInvitationSchema).
 */
export const completeTeamInvitationSchema = z.object({
  token: z.string().trim().min(20, 'That invitation link is not valid.').max(200),
  password: passwordSchema,
  /** Optional override of the name the owner typed when inviting them. */
  name: z.string().trim().min(2).max(120).optional(),
});
export type CompleteTeamInvitationDto = z.infer<typeof completeTeamInvitationSchema>;
