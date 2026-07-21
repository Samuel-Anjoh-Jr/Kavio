import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  TrustEventType,
  TrustPillar,
  VerificationCheckType,
  VerificationTier,
} from '@trustpro/database';

/**
 * Trust reads (TRU-01, TRU-04), served over GraphQL per the DUAL API RULE.
 *
 * These are PUBLIC types: the guest first-interface lets an unauthenticated
 * visitor open a full worker profile, and the Trust Score ring is the whole
 * point of that profile. Nothing here exposes a document, a rejection reason or
 * anything else a stranger has no business seeing — the score, its four pillars,
 * and what earned them.
 *
 * User-facing copy is NOT returned from the API. Every explanatory string is a
 * stable `*Key` that the web resolves through next-intl, which is what keeps
 * EN/FR parity enforceable in one catalogue instead of two.
 */

@ObjectType({ description: 'One scoring rule’s contribution to a sub-score.' })
export class TrustContributionView {
  @Field(() => TrustEventType, { description: 'The signal this row scores.' })
  type!: TrustEventType;

  @Field(() => Int, { description: 'How many times it has happened.' })
  occurrences!: number;

  @Field(() => Int, { description: 'Points counted, after caps and tapering.' })
  points!: number;

  @Field(() => Int, { description: 'The most this signal can ever contribute.' })
  max!: number;

  @Field({ description: 'True once this signal is contributing everything it can.' })
  maxed!: boolean;

  // Explicit `() => String`: TypeScript erases the `string | null` union to
  // Object in the decorator metadata, so the schema builder cannot infer a type
  // and refuses to build. Every nullable union field needs the thunk.
  @Field(() => String, {
    description:
      'i18n key for the "how to improve" line, e.g. "Trust.improve.ID_VERIFIED". Null once maxed.',
    nullable: true,
  })
  improvementKey!: string | null;
}

@ObjectType({ description: 'One of the four trust pillars (SRS §21.6).' })
export class TrustSubScoreView {
  @Field(() => TrustPillar)
  pillar!: TrustPillar;

  @Field(() => Int, { description: 'Points earned in this pillar.' })
  points!: number;

  @Field(() => Int, { description: 'The pillar’s ceiling. Zero while unscored.' })
  max!: number;

  @Field({
    description:
      'False for a pillar with no scoring rules yet (Financial, until escrow ships). Render it as "coming soon", never as a zero the user earned.',
  })
  scored!: boolean;

  @Field(() => [TrustContributionView], {
    description: 'The inputs behind this sub-score, itemised (TRU-04).',
  })
  contributions!: TrustContributionView[];
}

@ObjectType({ description: 'An identity’s Trust Score (TRU-01).' })
export class TrustScoreView {
  @Field(() => ID)
  subjectId!: string;

  @Field(() => Int, { description: 'The Trust Score, 0–100.' })
  total!: number;

  @Field(() => VerificationTier, { description: 'Derived tier (TRU-02).' })
  tier!: VerificationTier;

  @Field({
    description:
      'True when confirmed fraudulent documents overrode the score (TRU-08). The number is meaningless while this is set.',
  })
  suspended!: boolean;

  @Field(() => Int, { description: 'Completed jobs, a Tier 3 gate input.' })
  completedJobs!: number;

  @Field(() => Date, { description: 'When this snapshot was computed.' })
  computedAt!: Date;
}

@ObjectType({ description: 'A requirement still standing between an identity and the next tier.' })
export class TierRequirementView {
  @Field({ description: 'SCORE | CHECK | COMPLETED_JOBS | AVERAGE_RATING.' })
  kind!: string;

  @Field(() => VerificationCheckType, {
    nullable: true,
    description: 'The outstanding check, when kind is CHECK.',
  })
  checkType!: VerificationCheckType | null;

  @Field({ description: 'i18n key for the requirement line.' })
  labelKey!: string;

  @Field({ description: 'What the gate demands, as a display string.' })
  required!: string;

  @Field({ description: 'Where the identity currently stands.' })
  current!: string;
}

@ObjectType({ description: 'Tier status and what unlocks the next one (TRU-02, TRU-05).' })
export class TierStatusView {
  @Field(() => ID)
  subjectId!: string;

  @Field(() => VerificationTier)
  tier!: VerificationTier;

  @Field({
    description:
      'i18n key for the tier label. Tier 0 resolves to "Basic Profile" — never anything implying verification (TRU-03).',
  })
  labelKey!: string;

  @Field({ description: 'False for Tier 0, so the UI can withhold any verified styling.' })
  verified!: boolean;

  @Field(() => VerificationTier, {
    nullable: true,
    description: 'The next rung, or null at the top.',
  })
  nextTier!: VerificationTier | null;

  @Field(() => [TierRequirementView], {
    description: 'Everything still missing for `nextTier`. Empty at the top tier.',
  })
  requirements!: TierRequirementView[];
}

@ObjectType({
  description:
    'The full Trust Score breakdown: each sub-score, its inputs, and how to improve (TRU-04).',
})
export class TrustBreakdownView {
  @Field(() => ID)
  subjectId!: string;

  @Field(() => Int)
  total!: number;

  @Field(() => VerificationTier)
  tier!: VerificationTier;

  @Field()
  suspended!: boolean;

  @Field(() => [TrustSubScoreView], { description: 'The four pillars (SRS §21.6).' })
  subScores!: TrustSubScoreView[];

  @Field(() => TierStatusView, { description: 'Current tier and the next rung’s requirements.' })
  tierStatus!: TierStatusView;

  @Field(() => [TrustContributionView], {
    nullable: true,
    description:
      'Ranked "do this next" list, highest points first. Returned only to the subject themselves and to staff — how far along another user’s verification is, is their business.',
  })
  improvements!: TrustContributionView[] | null;
}
