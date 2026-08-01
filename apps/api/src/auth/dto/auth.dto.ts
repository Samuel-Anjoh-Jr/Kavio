import { VerificationPurpose } from '@kavio/database';
import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth.config';

/**
 * Auth request schemas (ACC-04, ACC-05, ACC-08). Every message here is written to
 * be shown verbatim to a non-technical user and is mirrored EN/FR in the web
 * app's message catalogue via the returned error `code`.
 */

/** Phone or email in one field — the sign-in form asks for "phone or email". */
export const identifierSchema = z
  .string({ message: 'Enter your phone number or email.' })
  .trim()
  .min(1, 'Enter your phone number or email.')
  .max(320, 'That is too long to be a phone number or email.');

export const passwordSchema = z
  .string({ message: 'Enter a password.' })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, 'That password is too long.');

export const otpCodeSchema = z
  .string({ message: 'Enter the code we sent you.' })
  .trim()
  // Digits only, so a pasted code with spaces still needs cleaning client-side
  // rather than silently failing verification against a hash.
  .regex(/^\d{4,10}$/, 'Enter the code exactly as you received it.');

/** Purposes a client may request directly. TWO_FACTOR is issued by the server
 *  during login and EMAIL_VERIFICATION from the settings screen, so neither can
 *  be minted on demand by an anonymous caller. */
export const requestableOtpPurposes = [
  VerificationPurpose.PHONE_VERIFICATION,
  VerificationPurpose.LOGIN,
] as const;

export const requestOtpSchema = z.object({
  identifier: identifierSchema,
  purpose: z.enum(requestableOtpPurposes).default(VerificationPurpose.PHONE_VERIFICATION),
  website: z.string().max(0).optional(),
});

export const verifyOtpSchema = z.object({
  identifier: identifierSchema,
  purpose: z.enum(requestableOtpPurposes).default(VerificationPurpose.PHONE_VERIFICATION),
  code: otpCodeSchema,
});

export const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string({ message: 'Enter your password.' }).min(1, 'Enter your password.'),
  website: z.string().max(0).optional(),
});

export const twoFactorVerifySchema = z.object({
  identifier: identifierSchema,
  code: otpCodeSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string({ message: 'Missing refresh token.' }).min(1, 'Missing refresh token.'),
});

export const logoutSchema = refreshSchema;

export const forgotPasswordSchema = z.object({
  identifier: identifierSchema,
  website: z.string().max(0).optional(),
});

export const resetPasswordSchema = z.object({
  token: z
    .string({ message: 'This reset link is not valid.' })
    .min(1, 'This reset link is not valid.'),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: passwordSchema,
});

/** Toggling 2FA re-asks for the password: it changes the security posture of the
 *  account, so a stolen access token alone must not be enough. */
export const toggleTwoFactorSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm.'),
});

/** Same 2-160 bound the sign-up name field and onboarding's display-name step use. */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(160, 'That name is too long.'),
});

/** Shape only — normalisation and the uniqueness/verification rules live in
 *  ProfileService, same split as sign-up. */
export const changePhoneSchema = z.object({
  phone: z
    .string({ message: 'Enter your phone number.' })
    .trim()
    .min(1, 'Enter your phone number.'),
});

/** Roles a user may grant themselves. AGENT and ADMIN are assigned by Kavio
 *  only — self-service would be a privilege-escalation hole. */
export const selfAssignableRoles = ['WORKER', 'CLIENT', 'BUSINESS'] as const;

export const switchRoleSchema = z.object({
  role: z.enum(selfAssignableRoles, { message: 'Choose a valid role.' }),
});

export const addRoleSchema = switchRoleSchema;

export type RequestOtpDto = z.infer<typeof requestOtpSchema>;
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type TwoFactorVerifyDto = z.infer<typeof twoFactorVerifySchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;
export type LogoutDto = z.infer<typeof logoutSchema>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
export type ChangePhoneDto = z.infer<typeof changePhoneSchema>;
export type ToggleTwoFactorDto = z.infer<typeof toggleTwoFactorSchema>;
export type SwitchRoleDto = z.infer<typeof switchRoleSchema>;
export type AddRoleDto = z.infer<typeof addRoleSchema>;
