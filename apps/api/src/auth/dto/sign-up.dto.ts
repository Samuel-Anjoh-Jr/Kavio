import { z } from 'zod';

/**
 * Sign-up captures the visitor's *intent* — not a role name — so the guest
 * first-interface stays plain-language. The service maps the intent to the
 * initial {@link Role}. Phone is validated for shape here and normalised to
 * E.164 in the service (single source of truth for the CM plan).
 */
export const signUpSchema = z.object({
  roleIntent: z.enum(['find_work', 'hire'], {
    message: 'Choose whether you want to find work or hire.',
  }),
  phone: z
    .string({ message: 'Enter your phone number.' })
    .trim()
    .min(1, 'Enter your phone number.'),
  // Honeypot: a hidden field real users never see. Bots fill it in; a non-empty
  // value fails validation without revealing why (SRS §18 — public form abuse).
  website: z.string().max(0).optional(),
});

export type SignUpDto = z.infer<typeof signUpSchema>;

export type RoleIntent = SignUpDto['roleIntent'];
