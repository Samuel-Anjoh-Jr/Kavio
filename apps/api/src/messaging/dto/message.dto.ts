import { z } from 'zod';
import { AbuseReportReason, MessageKind } from '@kavio/database';

/**
 * Messaging WRITE DTOs (MSG-01, MSG-04). Validated with Zod before the DB, per
 * the engineering standard. Reads are GraphQL and carry no DTO.
 */

/** Opens (or resumes) a job-linked conversation with another identity. */
export const startConversationSchema = z
  .object({
    /** The identity to talk to. Required — a conversation always has two members. */
    recipientId: z.string().uuid(),
    /** The job the conversation is about (MSG-01 "job-linked"). Optional. */
    jobId: z.string().uuid().optional(),
    /** An optional first message sent atomically with the conversation. */
    message: z.string().trim().min(1).max(4000).optional(),
  })
  .strict();
export type StartConversationDto = z.infer<typeof startConversationSchema>;

/**
 * Sends a message into an existing conversation. The `kind` decides which of the
 * other fields is meaningful — a TEXT needs `body`, a LOCATION needs lat/lng, a
 * card kind (QUOTE/JOB/PAYMENT) needs `refId`. Cross-field rules are enforced in
 * the service so the error messages can be specific.
 */
export const sendMessageSchema = z
  .object({
    kind: z.nativeEnum(MessageKind).default(MessageKind.TEXT),
    body: z.string().trim().min(1).max(4000).optional(),
    /** Owned MESSAGE_IMAGE / MESSAGE_VOICE asset ids to attach. */
    attachmentAssetIds: z.array(z.string().uuid()).max(10).optional(),
    /** For LOCATION messages — a shared pin. */
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    /** For QUOTE/JOB/PAYMENT cards — the id of the referenced record. */
    refId: z.string().uuid().optional(),
    /**
     * Client-generated id echoed back on the realtime ack, so an optimistic UI
     * can reconcile the sent bubble without waiting for a refetch.
     */
    clientRef: z.string().max(64).optional(),
  })
  .strict();
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

/** Blocks another identity (MSG-04). */
export const blockUserSchema = z
  .object({
    userId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
export type BlockUserDto = z.infer<typeof blockUserSchema>;

/** Reports a conversation, a message, or a user (MSG-04). */
export const reportSchema = z
  .object({
    /** The identity being reported — always required, even when a message is cited. */
    reportedUserId: z.string().uuid(),
    conversationId: z.string().uuid().optional(),
    messageId: z.string().uuid().optional(),
    reason: z.nativeEnum(AbuseReportReason),
    details: z.string().trim().max(2000).optional(),
  })
  .strict();
export type ReportDto = z.infer<typeof reportSchema>;
