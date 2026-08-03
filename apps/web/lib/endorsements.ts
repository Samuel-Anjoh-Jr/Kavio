'use client';

import { restPost } from './rest-api';

/**
 * Endorsement WRITES (REST, per the DUAL API RULE). Reads are the read-only
 * `endorsementCount` on the GraphQL worker profile (lib/graphql/discovery.ts).
 *
 * Mirrors apps/api/src/trust/endorsements/endorsements.controller.ts. Every
 * anti-abuse rule (one per author per subject, no self-endorsement, the cap,
 * the taper) is enforced server-side — nothing here is load-bearing for that.
 */

/** Mirrors the API's EndorsementRelationship enum. */
export type EndorsementRelationship =
  | 'PREVIOUS_CUSTOMER'
  | 'WORKSHOP_OWNER'
  | 'QUARTER_CHIEF'
  | 'LANDLORD'
  | 'COMMUNITY_LEADER'
  | 'COLLEAGUE';

export const ENDORSEMENT_RELATIONSHIPS: readonly EndorsementRelationship[] = [
  'PREVIOUS_CUSTOMER',
  'WORKSHOP_OWNER',
  'QUARTER_CHIEF',
  'LANDLORD',
  'COMMUNITY_LEADER',
  'COLLEAGUE',
];

export interface CreateEndorsementInput {
  subjectId: string;
  relationship: EndorsementRelationship;
  quote: string;
  rating: number;
}

export function createEndorsement(
  input: CreateEndorsementInput,
): Promise<{ id: string; status: string }> {
  return restPost<{ id: string; status: string }>('endorsements', input);
}
