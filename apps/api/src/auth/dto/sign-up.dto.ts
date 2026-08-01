import { z } from 'zod';
import { passwordSchema } from './auth.dto';

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
  /**
   * Collected once, here, rather than re-asked during onboarding: this is the
   * identity-level name (User.name), what a worker or client is called across
   * every role. Same 2-160 bound onboarding already used for it.
   */
  name: z
    .string({ message: 'Enter your name.' })
    .trim()
    .min(2, 'Enter your name.')
    .max(160, 'That name is too long.'),
  phone: z
    .string({ message: 'Enter your phone number.' })
    .trim()
    .min(1, 'Enter your phone number.'),
  /**
   * Optional at sign-up but strongly wanted: email is the only channel that
   * actually delivers at launch (SMS is deferred), so an account without one
   * cannot receive its own verification code. The UI asks for it; the schema
   * does not force it, because a phone-only signup must still be possible once
   * SMS is live.
   */
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.')
    .max(320, 'That email address is too long.')
    .optional(),
  /**
   * Optional too: a user may verify by code first and set a password later via
   * the reset flow, which suits the low-friction phone-first onboarding.
   */
  password: passwordSchema.optional(),
  // Honeypot: a hidden field real users never see. Bots fill it in; a non-empty
  // value fails validation without revealing why (SRS §18 — public form abuse).
  website: z.string().max(0).optional(),
});

export type SignUpDto = z.infer<typeof signUpSchema>;

export type RoleIntent = SignUpDto['roleIntent'];
