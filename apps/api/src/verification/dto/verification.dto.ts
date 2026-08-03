import {
  EndorsementRelationship,
  VerificationCheckType,
  VerificationRejectionReason,
  VerificationStage,
} from '@kavio/database';
import { z } from 'zod';

/**
 * Write DTOs, validated before anything reaches the database (NFR-SEC-03).
 *
 * Messages are written for the person who will see them inline on the form, not
 * for the developer reading a stack trace.
 */

export const submitVerificationSchema = z.object({
  checkType: z.enum(VerificationCheckType, { message: 'Choose what you are verifying.' }),
  documentIds: z
    .array(z.uuid({ message: 'That file reference is not valid.' }))
    .max(10, { message: 'That is more files than this step needs.' })
    .default([]),
});

export type SubmitVerificationDto = z.infer<typeof submitVerificationSchema>;

export const requestFieldVisitSchema = z.object({
  // Optional detail for the agent planning the visit (a landmark, a preferred
  // time). Never a substitute for the visit itself, so it stays short.
  note: z.string().trim().max(300).optional(),
});

export type RequestFieldVisitDto = z.infer<typeof requestFieldVisitSchema>;

export const rejectVerificationSchema = z.object({
  reason: z.enum(VerificationRejectionReason, {
    message: 'Choose a reason so the person knows what to fix.',
  }),
  // Staff-facing detail. Never rendered to the subject: it is neither localized
  // nor guaranteed to be kind, which is exactly why the REASON is a code.
  note: z.string().trim().max(500).optional(),
});

export type RejectVerificationDto = z.infer<typeof rejectVerificationSchema>;

export const advanceVerificationSchema = z.object({
  stage: z.enum(VerificationStage, { message: 'Choose a stage.' }),
  note: z.string().trim().max(500).optional(),
});

export type AdvanceVerificationDto = z.infer<typeof advanceVerificationSchema>;

export const requestInfoSchema = z.object({
  // This one IS shown to the subject, so it has to be substantial enough to act
  // on — "more info please" helps nobody and costs another round trip.
  infoRequest: z
    .string()
    .trim()
    .min(10, { message: 'Say what is needed, so they know exactly what to send.' })
    .max(500),
});

export type RequestInfoDto = z.infer<typeof requestInfoSchema>;

export const approveVerificationSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type ApproveVerificationDto = z.infer<typeof approveVerificationSchema>;

/** Founding Professional intake (TRU-09, AGT-01). Kept short — it is filled in
 *  on a phone, standing in a workshop. */
export const foundingIntakeSchema = z.object({
  phone: z.string().trim().min(6, { message: 'Enter their phone number.' }),
  name: z.string().trim().min(2, { message: 'Enter their name.' }).max(120),
  locale: z.enum(['en', 'fr']).optional(),
  city: z.string().trim().max(80).optional(),
  area: z.string().trim().max(80).optional(),
  headline: z.string().trim().max(160).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  note: z.string().trim().max(500).optional(),
  documentIds: z.array(z.uuid()).max(10).default([]),
});

export type FoundingIntakeDto = z.infer<typeof foundingIntakeSchema>;

export const createEndorsementSchema = z.object({
  subjectId: z.uuid({ message: 'That profile reference is not valid.' }),
  relationship: z.enum(EndorsementRelationship, {
    message: 'Say how you know this person.',
  }),
  quote: z
    .string()
    .trim()
    .min(10, { message: 'Say a little about working with them.' })
    .max(500, { message: 'Keep it under 500 characters.' }),
  rating: z
    .number()
    .int()
    .min(1, { message: 'Choose between 1 and 5 stars.' })
    .max(5, { message: 'Choose between 1 and 5 stars.' }),
  /** Only a Field Agent may set this; the service enforces that. */
  authorName: z.string().trim().min(2).max(120).optional(),
});

export type CreateEndorsementDto = z.infer<typeof createEndorsementSchema>;

export const revokeEndorsementSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type RevokeEndorsementDto = z.infer<typeof revokeEndorsementSchema>;
