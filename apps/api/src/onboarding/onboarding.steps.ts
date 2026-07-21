import { OnboardingRole } from '@trustpro/database';
import { z } from 'zod';

/**
 * The onboarding flows (ACC-10) and the completion model behind TRU-05.
 *
 * Steps are DATA, not control flow spread across screens: the same definition
 * drives per-step validation, the completion percentage, and the resume point,
 * so the server and the UI can never disagree about how far along someone is.
 */

const locationSchema = z.object({
  city: z.string().trim().min(1, 'Choose your city.').max(120),
  area: z.string().trim().max(160).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  /**
   * A human-placed pin ALWAYS overrides an auto-detected fix (CLAUDE.md
   * SPATIAL), so the client reports where the value came from and the server
   * stores that provenance rather than guessing later.
   */
  source: z.enum(['DEVICE_GPS', 'HUMAN_INPUT', 'REVERSE_GEOCODE']).default('HUMAN_INPUT'),
});

const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Name the service you offer.').max(120),
  description: z.string().trim().max(600).optional(),
  /** XAF, whole units — the currency has no minor unit. */
  startingPrice: z.number().int().min(0).max(100_000_000).optional(),
});

const availabilitySlotSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 08:00.'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 17:00.'),
  })
  .refine((slot) => slot.startTime < slot.endTime, {
    path: ['endTime'],
    message: 'The end time must be after the start time.',
  });

const portfolioItemSchema = z.object({
  mediaAssetId: z.string().uuid(),
  caption: z.string().trim().max(240).optional(),
  type: z.enum(['PHOTO', 'VIDEO', 'PROJECT']).default('PHOTO'),
  groupKey: z.string().trim().max(80).optional(),
});

const teamMemberSchema = z.object({
  name: z.string().trim().min(2, 'Enter the team member’s name.').max(160),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').optional(),
  phone: z.string().trim().max(32).optional(),
  role: z.enum(['ADMIN', 'HR_MANAGER', 'ACCOUNTANT', 'STAFF']).default('STAFF'),
  accessLevel: z.enum(['FULL', 'MANAGE_JOBS', 'PAYMENTS', 'VIEW_ONLY']).default('VIEW_ONLY'),
});

export interface OnboardingStepDef {
  key: string;
  /** Validates just this step's slice of the payload. */
  schema: z.ZodType;
  /** Whether the accumulated data satisfies this step. Drives the percentage. */
  isComplete: (data: Record<string, unknown>) => boolean;
  /**
   * Optional steps still count toward completion but never block finishing.
   * Portfolio and ID are the trust-building steps — strongly encouraged, and
   * gating the flow on them would strand workers who cannot photograph an ID
   * today, which is exactly the drop-off progressive verification avoids.
   */
  required: boolean;
}

function nonEmptyArray(data: Record<string, unknown>, key: string): boolean {
  const value = data[key];
  return Array.isArray(value) && value.length > 0;
}

function hasKeys(data: Record<string, unknown>, key: string, fields: string[]): boolean {
  const value = data[key];
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return fields.every((field) => {
    const entry = record[field];
    return typeof entry === 'string' ? entry.trim().length > 0 : entry !== undefined && entry !== null;
  });
}

const WORKER_STEPS: OnboardingStepDef[] = [
  {
    key: 'services',
    schema: z.object({ services: z.array(serviceSchema).min(1, 'Add at least one service.').max(20) }),
    isComplete: (data) => nonEmptyArray(data, 'services'),
    required: true,
  },
  {
    key: 'availability',
    schema: z.object({ availability: z.array(availabilitySlotSchema).max(40) }),
    isComplete: (data) => nonEmptyArray(data, 'availability'),
    required: true,
  },
  {
    key: 'portfolio',
    schema: z.object({ portfolio: z.array(portfolioItemSchema).max(30) }),
    isComplete: (data) => nonEmptyArray(data, 'portfolio'),
    required: false,
  },
  {
    key: 'identity',
    schema: z.object({
      identity: z.object({
        idFrontAssetId: z.string().uuid().optional(),
        idBackAssetId: z.string().uuid().optional(),
        selfieAssetId: z.string().uuid().optional(),
      }),
    }),
    isComplete: (data) => hasKeys(data, 'identity', ['idFrontAssetId', 'selfieAssetId']),
    required: false,
  },
  {
    key: 'location',
    schema: z.object({ location: locationSchema }),
    isComplete: (data) => hasKeys(data, 'location', ['city']),
    required: true,
  },
];

const CLIENT_STEPS: OnboardingStepDef[] = [
  {
    key: 'profile',
    schema: z.object({
      profile: z.object({
        displayName: z.string().trim().min(2, 'Enter your name.').max(160),
      }),
    }),
    isComplete: (data) => hasKeys(data, 'profile', ['displayName']),
    required: true,
  },
  {
    key: 'location',
    schema: z.object({ location: locationSchema }),
    isComplete: (data) => hasKeys(data, 'location', ['city']),
    required: true,
  },
];

const BUSINESS_STEPS: OnboardingStepDef[] = [
  {
    key: 'company',
    schema: z.object({
      company: z.object({
        name: z.string().trim().min(2, 'Enter the company name.').max(200),
        description: z.string().trim().max(1200).optional(),
        rccmNumber: z.string().trim().max(80).optional(),
        taxId: z.string().trim().max(80).optional(),
        contactEmail: z.string().trim().toLowerCase().email('Enter a valid email address.').optional(),
        contactPhone: z.string().trim().max(32).optional(),
        address: z.string().trim().max(300).optional(),
        city: z.string().trim().max(120).optional(),
      }),
    }),
    isComplete: (data) => hasKeys(data, 'company', ['name']),
    required: true,
  },
  {
    key: 'documents',
    schema: z.object({
      documents: z.object({
        registrationAssetId: z.string().uuid().optional(),
        logoAssetId: z.string().uuid().optional(),
      }),
    }),
    isComplete: (data) => hasKeys(data, 'documents', ['registrationAssetId']),
    required: false,
  },
  {
    key: 'team',
    schema: z.object({ team: z.array(teamMemberSchema).max(50) }),
    isComplete: (data) => nonEmptyArray(data, 'team'),
    required: false,
  },
];

export const ONBOARDING_STEPS: Readonly<Record<OnboardingRole, OnboardingStepDef[]>> = {
  [OnboardingRole.WORKER]: WORKER_STEPS,
  [OnboardingRole.CLIENT]: CLIENT_STEPS,
  [OnboardingRole.BUSINESS]: BUSINESS_STEPS,
};

/**
 * Benefit unlocks shown instead of a checklist (TRU-05: "Complete your profile,
 * 60%. Unlock: Verified badge, more customers, priority search").
 *
 * The keys are message-catalogue keys, never copy — the whole point is that the
 * EN/FR wording lives in one place and this table stays about thresholds.
 */
export interface UnlockDef {
  key: string;
  threshold: number;
}

export const ONBOARDING_UNLOCKS: Readonly<Record<OnboardingRole, UnlockDef[]>> = {
  [OnboardingRole.WORKER]: [
    { key: 'appear_in_search', threshold: 40 },
    { key: 'portfolio_showcase', threshold: 60 },
    { key: 'verified_badge', threshold: 80 },
    { key: 'priority_placement', threshold: 100 },
  ],
  [OnboardingRole.CLIENT]: [
    { key: 'post_jobs', threshold: 50 },
    { key: 'nearby_workers', threshold: 100 },
  ],
  // Thresholds must land on values the step count can actually produce — with
  // three steps that is 0/33/67/100, so 34 here would be an unlock the user can
  // see but never earn.
  [OnboardingRole.BUSINESS]: [
    { key: 'company_profile', threshold: 33 },
    { key: 'verified_business_review', threshold: 67 },
    { key: 'team_hiring', threshold: 100 },
  ],
};

export function stepsFor(role: OnboardingRole): OnboardingStepDef[] {
  return ONBOARDING_STEPS[role];
}

export function firstStepKey(role: OnboardingRole): string {
  // Every role's step list is a non-empty literal above, so this is a type
  // narrowing rather than a real fallback.
  return stepsFor(role)[0]?.key ?? '';
}

/**
 * Completion as a plain proportion of steps satisfied.
 *
 * Every step counts equally, including the optional ones — that is what makes
 * "80%: unlock the verified badge" mean something. Weighting required steps
 * higher would let a worker sit at 100% having uploaded nothing.
 */
export function computeCompletion(role: OnboardingRole, data: Record<string, unknown>): number {
  const steps = stepsFor(role);
  const done = steps.filter((step) => step.isComplete(data)).length;
  return Math.round((done / steps.length) * 100);
}

export function completedStepKeys(role: OnboardingRole, data: Record<string, unknown>): string[] {
  return stepsFor(role)
    .filter((step) => step.isComplete(data))
    .map((step) => step.key);
}

/** The first unsatisfied step — where "resume" drops the user back in. */
export function nextStepKey(role: OnboardingRole, data: Record<string, unknown>): string {
  const steps = stepsFor(role);
  // All steps satisfied — stay on the last one, which is the review/finish step.
  return steps.find((step) => !step.isComplete(data))?.key ?? steps[steps.length - 1]?.key ?? '';
}

export function missingRequiredSteps(
  role: OnboardingRole,
  data: Record<string, unknown>,
): string[] {
  return stepsFor(role)
    .filter((step) => step.required && !step.isComplete(data))
    .map((step) => step.key);
}
