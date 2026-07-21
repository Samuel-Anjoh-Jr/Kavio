'use client';

import { restPost } from './rest-api';
import type { VerificationRejectionReason, VerificationStage } from './verification';

/**
 * Verification WRITES (REST, per the DUAL API RULE). Reads are the GraphQL
 * documents in lib/graphql/documents.ts.
 *
 * Mirrors apps/api/src/verification/verification.controller.ts. Every review
 * action is RBAC-gated server-side on `admin:verification_review` and
 * audit-logged; nothing here is load-bearing for authorisation, and the UI
 * hiding a button is a courtesy, never a control.
 */

export interface ReviewResult {
  id: string;
  stage: VerificationStage;
  status: string;
}

/** Takes the item, so two agents do not review the same submission. */
export function claimVerification(id: string): Promise<ReviewResult> {
  return restPost<ReviewResult>(`verifications/${id}/claim`);
}

export function advanceVerification(
  id: string,
  stage: VerificationStage,
  note?: string,
): Promise<ReviewResult> {
  return restPost<ReviewResult>(`verifications/${id}/stage`, { stage, note });
}

export function approveVerification(id: string, note?: string): Promise<ReviewResult> {
  return restPost<ReviewResult>(`verifications/${id}/approve`, { note });
}

/**
 * `reason` is a CODE, not a sentence — the friendly retry copy the subject sees
 * is localized EN/FR in the web catalogue (TRU-07). `note` is staff-facing
 * detail and is never shown to the subject.
 */
export function rejectVerification(
  id: string,
  reason: VerificationRejectionReason,
  note?: string,
): Promise<ReviewResult> {
  return restPost<ReviewResult>(`verifications/${id}/reject`, { reason, note });
}

/** Unlike a rejection, this keeps the item in the queue and asks for one thing. */
export function requestMoreInfo(id: string, infoRequest: string): Promise<ReviewResult> {
  return restPost<ReviewResult>(`verifications/${id}/request-info`, { infoRequest });
}

export interface SubmissionResult {
  id: string;
  checkType: string;
  status: string;
  stage: VerificationStage;
}

/** The subject sending their own evidence (TRU-06). */
export function submitVerification(
  checkType: string,
  documentIds: string[],
): Promise<SubmissionResult> {
  return restPost<SubmissionResult>('verifications', { checkType, documentIds });
}
